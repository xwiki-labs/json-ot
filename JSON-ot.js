(function () {

var OT = {};

/*
    TODO
    don't just replace strings. patch them with text patcher.
*/

var isArray = OT.isArray = function (obj) {
    return Object.prototype.toString.call(obj)==='[object Array]';
};

/*  Arrays and nulls both register as 'object' when using native typeof
    we need to distinguish them as their own types, so use this instead. */
var type = OT.type = function (dat) {
    return dat === null?  'null': isArray(dat)?'array': typeof(dat);
};

var find = OT.find = function (map, path) {
    /* safely search for nested values in an object via a path */
    return (map && path.reduce(function (p, n) {
        return typeof p[n] !== 'undefined' && p[n];
    }, map)) || undefined;
};

var clone = OT.clone = function (val) {
    return JSON.parse(JSON.stringify(val));
};

var deepEqual = OT.deepEqual = function (A, B) {
    var t_A = type(A);
    var t_B = type(B);
    if (t_A !== t_B) { return false; }
    if (t_A === 'object') {
        var k_A = Object.keys(A);
        var k_B = Object.keys(B);
        return k_A.length === k_B.length &&
            !k_A.some(function (a, i) { return !deepEqual(A[a], B[a]); }) &&
            !k_B.some(function (b) { return !(b in A); });
    } else if (t_A === 'array') {
        return A.length === B.length &&
            !A.some(function (a, i) { return !deepEqual(a, B[i]); });
    } else {
        return A === B;
    }
};

var operation = OT.operation = function (type, path, value, prev, other) {
    var res = {
        type: type,
        path: path,
        value: value,
    };
    if (type === 'replace') {
        res.prev = prev;
    } else if (type === 'splice') {
        res.offset = prev;
        res.removals = other;
    } else if (type !== 'remove') { throw new Error('expected a removal'); }
    // if it's not a replace or splice, it's a 'remove'
    return res;
};

var replace = OT.replace = function (ops, path, to, from) {
    ops.push(operation('replace', path, to, from));
};

var remove = OT.remove = function (ops, path, val) {
    ops.push(operation('remove', path, val));
};


// HERE
var splice = OT.splice = function (ops, path, value, offset, removals) {
    ops.push(operation('splice', path, value, offset, removals));
};

/*
  all of A's path is at the beginning of B
  roughly:  B.indexOf(A) === 0
*/
var pathOverlaps = OT.pathOverlaps = function (A, B) {
    return !A.some(function (a, i) {
        return a !== B[i];
    });
};

// OT Case #1 replace->replace ✔
// OT Case #2 replace->remove ✔
// OT Case #3 replace->splice ✔
// OT Case #4 remove->replace ✔
// OT Case #5 remove->remove ✔
// OT Case #6 remove->splice ✔
// OT Case #7 splice->replace ✔
// OT Case #8 splice->remove ✔
// OT Case #9 splice->splice ✔

var cases = (function () {
    var types = ['replace', 'remove', 'splice'];

    var matrix = {};
    var i = 1;

    types.forEach(function (a) {
        matrix[a] = {};

        return types.forEach(function (b) { matrix[a][b] = i++; });
    });
    return matrix;
}());

//console.log(cases);

var resolve = OT.resolve = function (A, B, arbiter) {
    if (!(type(A) === 'array' && type(B) === 'array')) {
        throw new Error("[resolve] expected two arrays");
    }

    /* OVERVIEW
     * A
     *  1. deduplicate removals
     *  2. adjust offset where a and be are both 'splice'
     *
     * B
     *  1. filter removals at identical paths
     *  2
     *
     *
     */


    // deduplicate removals
    A = A.filter(function (a) {
            // removals should not override replacements. (Case #4)
            return a.type !== 'remove' || !B.some(function (b) { return b.type === 'replace' && pathOverlaps(a.path, b.path); });
            // TODO conflict callback
        })
        .map(function (a) {
            B.forEach(function (b) {
                if (b.type === 'splice') {
                    // BUG - what we want to do here is change the path because there was something added in an array where this operation is a sub-element
                    if (pathOverlaps(b.path, a.path)) {
                        if (a.type === 'splice') {
                            a.offset += (b.value.length - b.removals);
                        } else {}
                    }
                }
            });
            return a;
        });

    B = B.filter(function (b) {
            // FIXME FALSE POSITIVE
            return !A.some(function (a) {
                return b.type === 'remove' && deepEqual(a.path, b.path);
            });
        })
        .filter(function (b) {
            // let A win conflicts over b

            // Arbiter is required here
            return !A.some(function (a) {
                if (b.type === 'replace' && a.type === 'replace') {
                    // remove any operations which return true
                    if (deepEqual(a.path, b.path)) {
                        if (typeof(a.value) === 'string' && typeof(b.value) === 'string') {
                            if (arbiter && a.prev === b.prev && a.value !== b.value) {
                                return arbiter(a, b, cases.replace.replace);
                            }
                            return true;
                        }
                        return true;
                    }
                }
            });
        })
        .map(function (b) {
            // if a splice in A modifies the path to b
            // update b's path to reflect that

            A.forEach(function (a) {
                if (a.type === 'splice') {
                  // TODO
                  // what if a.path == b.path
                  // what if a removes elements (splice) and b also removes elements
                  // (generally we merge these two together but it is probably best to allow the api customer to decide via a "strategy")
                  // Note that A might be removing *and* inserting because a splice is roughly equivilent to a ChainPad Operation
                  // Consult Transform0 :)
                    if (pathOverlaps(a.path, b.path)) {
                      // TODO validate that this isn't an off-by-one error
                        var pos = a.path.length;
                        if (typeof(b.path[pos]) === 'number' && a.offset <= b.path[pos]) {
                            b.path[pos] += (a.value.length - a.removals);
                        }
                    }
                }
            });

            return b;
        })
        .map(function (b) {
      // FIXME is this duplicating logic from above?
      // I don't remember
      // special case of above, can probably move this whole block up.  <-- cjd: +1

            // resolve insertion overlaps array.push conflicts

            // iterate over A such that each overlapping splice
            // adjusts the path/offset of b
            A.forEach(function (a) {
                if (a.type === 'splice') {
                    if (pathOverlaps(a.path, b.path)) {
                        if (b.type === 'splice') {
                          // what if the splice is a removal?
                            b.offset += (a.value.length - a.removals);
                          // if both A and B are removing the same thing
                          // be careful
                        } else {
                            // adjust the path of b to account for the splice
                            // TODO
                        }
                    }
                }
            });
            return b;
        });

    return A.concat(B);
};

// A, B, f, path, ops
var objects = OT.objects = function (A, B, path, ops) {
    var Akeys = Object.keys(A);
    var Bkeys = Object.keys(B);

    Bkeys.forEach(function (b) {
        var t_b = type(B[b]);
        var old = A[b];

        var nextPath = path.concat(b);

        if (Akeys.indexOf(b) === -1) {
            // there was an insertion

            // mind the fallthrough behaviour
            if (t_b === 'undefined') {
                throw new Error("undefined type has key. this shouldn't happen?");
            }
            if (old) { throw new Error("no such key existed in b, so 'old' should be falsey"); }
            replace(ops, nextPath, B[b], old);
            return;
        }

        // else the key already existed
        var t_a = type(old);
        if (t_a !== t_b) {
            // its type changed!
            console.log("type changed from [%s] to [%s]", t_a, t_b);
            // type changes always mean a change happened
            if (t_b === 'undefined') {
                throw new Error("first pass should never reveal undefined keys");
            }
            replace(ops, nextPath, B[b], old);
            return;
        }

        if (t_a === 'object') {
            // it's an object
            objects(A[b], B[b], nextPath, ops);
        } else if (t_a === 'array') {
            // it's an array
            OT.arrays(A[b], B[b], nextPath, ops);
        } else if (A[b] !== B[b]) {
            // it's not an array or object, so we can do === comparison
            replace(ops, nextPath, B[b], old);
        }
    });
    Akeys.forEach(function (a) {
        // the key was deleted
        if (Bkeys.indexOf(a) === -1 || type(B[a]) === 'undefined') {
            remove(ops, path.concat(a), A[a]);
        }
    });
};

var arrayShallowEquality = function (A, B) {
  if (A.length !== B.length) { return false; }
  for (var i = 0; i < A.length; i++) {
    var a = A[i];
    var b = B[i];
    if (a === b) { continue; }
    var t_a = type(a);
    var t_b = type(b);
    if (t_a !== t_b) { return false; }
    if (t_a !== 'array' && t_a === 'object') { return false; }
  }
  return true;
}

var arrays = OT.arrays = function (A_orig, B, path, ops) {
  var A = A_orig.slice(0); // shallow clone

  if (A.length === 0) {
    // A is zero length, this is going to be easy...
    splice(ops, path, B, 0, 0);

  } else if (arrayShallowEquality(A, B)) {
    // This is a relatively simple case, the elements in A and B are all of the same type and if
    // that type happens to be a primitive type, they are also equal.
    // This means no change will be needed at the level of this array, only it's children.
    A.forEach(function (a, i) {
      var b = B[i];
      var old = a;
      var nextPath = path.concat(i);
      switch (type(a)) {
        case 'undefined':
          throw new Error('existing key had type `undefined`. this should never happen');
        case 'object':
          objects(a, b, nextPath, ops);
          break;
        case 'array':
          arrays(a, b, nextPath, ops);
          break;
        default:
          if (a !== b) {
            throw new Error("unexpected type difference");
          }
          break;
      }
    });
  } else {
    // Something was changed in the length of the array or one of the primitives so we're going
    // to make an actual change to this array, not only it's children.
    var commonStart = 0;
    var commonEnd = 0;
    while (deepEqual(A[commonStart], B[commonStart])) { commonStart++; }
    while (deepEqual(A[A.length - 1 - commonEnd], B[B.length - 1 - commonEnd]) &&
           commonEnd + commonStart < A.length && commonEnd + commonStart < B.length)
    {
      commonEnd++;
    }
    var toRemove = A.length - commonStart - commonEnd;
    var toInsert = [];
    if (B.length !== commonStart + commonEnd) {
      toInsert = B.slice(commonStart, B.length - commonEnd);
    }
    splice(ops, path, toInsert, commonStart, toRemove);

  }
};

var diff = OT.diff = function (A, B) {
    var ops = [];

    var t_A = type(A);
    var t_B = type(B);

    if (t_A !== t_B) {
        throw new Error("Can't merge two objects of differing types");
    }

    if (t_B === 'array') {
        arrays(A, B, [], ops);
    } else if (t_B === 'object') {
        objects(A, B, [], ops);
    } else {
        throw new Error("unsupported datatype" + t_B);
    }
    return ops;
};

var applyOp = OT.applyOp = function (O, op) {
    var path;
    var key;
    switch (op.type) {
        case "replace":
            key = op.path[op.path.length -1];
            path = op.path.slice(0, op.path.length - 1);
            find(O, path)[key] = op.value;
            break;
        case "splice":
            var found = find(O, op.path);
            if (!found) {
                console.error("[applyOp] expected path [%s] to exist in object", op.path.join(','));
                throw new Error("Path did not exist");
            }
            //found.splice(op.offset, op.removals, op.value);
            //console.log(found);

            if (type(found) !== 'array') { throw new Error("Can't splice non-array"); }

            Array.prototype.splice.apply(found, [op.offset, op.removals].concat(op.value));
            //console.log(found);
            break;
        case "remove":
            key = op.path[op.path.length -1];
            path = op.path.slice(0, op.path.length - 1);
            delete find(O, path)[key];
            break;
    }
};

var patch = OT.patch = function (O, ops) {
    ops.forEach(function (op) {
        applyOp(O, op);
    });
    return O;
};

if (typeof(module) !== 'undefined' && module.exports) {
    module.exports = OT;
} else if ((typeof(define) !== 'undefined' && define !== null) &&
    (define.amd !== null)) {
    define(function () { return OT; });
} else {
    window.Transform = OT;
}

}());
