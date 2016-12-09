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

var cases = OT.cases = (function () {
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

/* stuff....   This is kind of a copy of Patch.transform() in ChainPad and the Operation.transform wants to be pluggable.
        It would probably be a good idea to treat strings as if they were arrays and then let the transform function (basically resolve)
        be pluggable.

var cjdOt0 = OT.cjdOt0 = function (tt, tb) {
    if (!pathOverlaps(tt.path, tb.path)) { return tt; }
    if (tt.path.length === tb.path.length) {
        if (tt.type === 'replace' && tb.type === 'replace' &&
            typeof(tt.value) === 'string' && typeof(tb.value) === 'string')
        {
            // String diffing is done in here instead of being handled in the diff operation.

            tt. HERE
        }
    }
};

var cjdOt = OT.cjdOt = function (toTransform, transformBy) {
    var out = [];
    for (var i = toTransform.length - 1; i >= 0; i--) {
        for (var j = transformBy.length - 1; j >= 0; j--) {
            toTransform[i] = cjdOt0(toTransform[i], transformBy[j]);
            if (!toTransform.operations[i]) { break; }
        }
        if (toTransform.operations[i]) { out.push(toTransform.operations[i]) }
    }
    return out;
}*/

// A and B are lists of operations which result from calling diff

var resolve = OT.resolve = function (A, B, arbiter) {
    if (!(type(A) === 'array' && type(B) === 'array')) {
        throw new Error("[resolve] expected two arrays");
    }

    /* OVERVIEW
     * B
     *  1. filter removals at identical paths
     *
     */

    B = B.filter(function (b) {
            // if A removed part of the tree you were working on...
            if (A.some(function (a) {
                if (a.type === 'remove') {
                    if (pathOverlaps(a.path, b.path)) {
                        if (b.path.length - a.path.length > 1) { return true; }
                    }
                }
            })) {
                // this is weird... FIXME
                return false;
            }

            /*  remove operations which would no longer make sense
                for instance, if a replaces an array with a string,
                that would invalidate a splice operation at that path */
            if (b.type === 'splice' && A.some(function (a) {
                if (a.type === 'splice' && pathOverlaps(a.path, b.path)) {
                    if (a.path.length - b.path.length < 0) {
                        if (!a.removals) { return; }

                        var start = a.offset;
                        var end = a.offset + a.removals;

                        for (;start < end; start++) {
                            if (start === b.path[a.path.length]) {
                                /*
                                if (typeof(arbiter) === 'function' &&
                                    deepEqual(a.path, b.path) &&
                                    a.value.length === 1 &&
                                    b.value.length === 1 &&
                                    typeof(a.value[0]) === 'string' &&
                                    typeof(b.value[0]) === 'string') {
                                    console.log('strings');

                                    return arbiter(a, b, cases.splice.splice);
                                }
                                */

                                // b is a descendant of a removal
                                return true;
                            }
                        }
                    }
                }
            })) { return false; }

            if (!A.some(function (a) {
                return b.type === 'remove' && deepEqual(a.path, b.path);
            })) { return true; }
        })
        .filter(function (b) {
            // let A win conflicts over b if no arbiter is supplied here

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

            // resolve insertion overlaps array.push conflicts
            // iterate over A such that each overlapping splice
            // adjusts the path/offset of b

                    if (OT.deepEqual(a.path, b.path)) {
                        if (b.type === 'splice') {
                          // what if the splice is a removal?
                            b.offset += (a.value.length - a.removals);
                          // if both A and B are removing the same thing
                          // be careful
                        } else {
                            // adjust the path of b to account for the splice
                            // TODO
                        }
                        return;
                    }

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
        });

    return B;
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
    if (type(A[i]) !== type(B[i])) { return false; }
  }
  return true;
}

// When an element in an array (number, string, bool) is changed, instead of a replace we
// will do a splice(offset, [element], 1)
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
      if (b === a) { return; }
      var old = a;
      var nextPath = path.concat(i);

        var t_a = type(a);
      switch (t_a) {
        case 'undefined':
          throw new Error('existing key had type `undefined`. this should never happen');
        case 'object':
          objects(a, b, nextPath, ops);
          break;
        case 'array':
          arrays(a, b, nextPath, ops);
          break;
        default:
        //console.log('replace: ' + t_a);
          //splice(ops, path, [b], i, 1);
          replace(ops, nextPath, b, old);
      }
    });
  } else {
    // Something was changed in the length of the array or one of the primitives so we're going
    // to make an actual change to this array, not only it's children.
    var commonStart = 0;
    var commonEnd = 0;
    while (commonStart < A.length && deepEqual(A[commonStart], B[commonStart])) { commonStart++; }
    while (deepEqual(A[A.length - 1 - commonEnd], B[B.length - 1 - commonEnd]) &&
           commonEnd + commonStart < A.length && commonEnd + commonStart < B.length)
    {
      commonEnd++;
    }
    var toRemove = A.length - commonStart - commonEnd;
    var toInsert;
    if (B.length !== commonStart + commonEnd) {
      toInsert = B.slice(commonStart, B.length - commonEnd);
    }
    splice(ops, path, toInsert, commonStart, toRemove);
  }
};

var Not_arrays = OT.Not_array = function (o_A, B, path, ops) {
    var A = o_A.slice(0); // shallow clone

    var l_A = A.length;
    var l_B = B.length;

    if (l_A !== l_B) {
        // B is longer than A
        // there has been an insertion (splice)

        // OR

        // A is longer than B
        // there has been a deletion

        if (A.length === 0) {
            splice(ops, path, B, 0, 0);
            return ops;
        }

        var commonStart;
        var commonEnd;

        var i = 0;

        // TODO:  This deepEqual() is going to be the source of the slow
        //        Possible solution is to deepEqualReplace() which replaces A with B in every case where deepEqual(A,B) then use ===
        while (deepEqual(A[i], B[i])) { i++; }
        commonStart = i;

/*
    var commonEnd = 0;
    while (oldval.charAt(oldval.length - 1 - commonEnd) === newval.charAt(newval.length - 1 - commonEnd) &&
        commonEnd + commonStart < oldval.length && commonEnd + commonStart < newval.length) {
        commonEnd++;
    }

    var toRemove = 0;
    var toInsert = '';

    /  throw some assertions in here before dropping patches into the realtime 
    if (oldval.length !== commonStart + commonEnd) {
        toRemove = oldval.length - commonStart - commonEnd;
    }
    if (newval.length !== commonStart + commonEnd) {
        toInsert = newval.slice(commonStart, newval.length - commonEnd);
    }
*/
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

      ///////
        i = 0;
        while ((i < A.length || i < B.length) && deepEqual(A[A.length - 1 - i], B[B.length - 1 - i])) { i++; }
        commonEnd = A.length - i;

        var insertion = B.slice(commonStart, commonEnd  + 1);

        var removal = commonEnd - commonStart;

        splice(ops, path, insertion, commonStart, removal);
        return ops;
    }

    // else they are the same length, iterate over their values
  // TODO: Behavior is very different for arrays of different length than for arrays of same length, this is wrong IMO
  //       I would use the exact same logic as textPatcher (copy/pasted as much as possible but with 
    A.forEach(function (a, i) {
        var t_a = type(a);
        var t_b = type(B[i]);

        var old = a;

        var nextPath = path.concat(i);

        // they have different types
        if (t_a !== t_b) {
            // TODO: These should be splices
            if (t_b === 'undefined') {
                remove(ops, nextPath, old);
            } else {
                replace(ops, nextPath, B[i], old);
            }
            return;
        }

        // same type
        // cjd: Here we drill down into the array, this is important because if nothing was changed at the level of this array itself,
        //      we really don't want to do any removal/insertion here.
        switch (t_b) {
            case 'undefined':
                throw new Error('existing key had type `undefined`. this should never happen');
            case 'object':
                objects(A[i], B[i], nextPath, ops);
                break;
            case 'array':
                arrays(A[i], B[i], nextPath, ops);
                break;
            default:
                if (A[i] !== B[i]) {
                  // TODO: This should be a splice
                    replace(ops, nextPath, B[i], old);
                    //splice(ops, path, B[i], i, 1); // MAYBE?
                }
                break;
        }
    });
    return ops;
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

            var parent = find(O, path);

            if (!parent) {
                throw new Error("cannot apply change to non-existent element");
            }
            parent[key] = op.value;
            break;
        case "splice":
            var found = find(O, op.path);
            if (!found) {
                console.error("[applyOp] expected path [%s] to exist in object", op.path.join(','));
                throw new Error("Path did not exist");
            }

            if (type(found) !== 'array') {
                throw new Error("Can't splice non-array");
            }

            Array.prototype.splice.apply(found, [op.offset, op.removals].concat(op.value));
            break;
        case "remove":
            key = op.path[op.path.length -1];
            path = op.path.slice(0, op.path.length - 1);
            delete find(O, path)[key];
            break;
        default:
            throw new Error('unsupported operation type');
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
