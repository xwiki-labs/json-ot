(function () {

var OT = {};

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
    }
    else if (type === 'splice') {
        res.offset = prev;
        res.removals = other;
    }
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
// OT Case #8 splice->remove
// OT Case #9 splice->splice ✔

var resolve = OT.resolve = function (A, B) {
    if (!(type(A) === 'array' && type(B) === 'array')) {
        throw new Error("[resolve] expected two arrays");
    }

    // deduplicate removals
    A = A.filter(function (a) {
            // removals should not override replacements. (Case #4)
            return a.type !== 'remove' || !B.some(function (b) { return b.type === 'replace' && OT.pathOverlaps(a.path, b.path); });
            // TODO conflict callback
        })
        .map(function (a) {
            // splice->remove (Case #8)
            B.forEach(function (b) {
                if (b.type === 'splice') {
                    if (pathOverlaps(b.path, a.path)) {
                        if (a.type === 'splice') {
                            a.offset += (b.value.length - b.removals);
                        } else {}
                    }
                }
            });
            return a;
        });
    return A
        .concat(B
        .filter(function (b) {
            // FIXME FALSE POSITIVE
            return !A.some(function (a) {
                return b.type === 'remove' && OT.deepEqual(a.path, b.path);
                //OT.pathOverlaps(a.path, b.path);
            });
        })
        .filter(function (b) {
            // let A win conflicts over b
            return !A.some(function (a) {
                return b.type === 'replace' && a.type === 'replace' &&
                    OT.pathOverlaps(a.path, b.path);
            });
        })
        .map(function (b) {
            // if a splice in A modifies the path to b
            // update b's path to reflect that

            A.forEach(function (a) {
                if (a.type === 'splice') {
                    if (OT.pathOverlaps(a.path, b.path)) {
                        //console.log("PATH OVERLAPS: [%s] => [%s]", a.path.join(","), b.path.join(","));

                        var pos = a.path.length;

                        // FIXME make sure this is safe
                        if (typeof(b.path[pos]) === 'number' && a.offset <= b.path[pos]) {
                            b.path[pos] += (a.value.length - a.removals);
                        }

                        //console.log(a);
                        //console.log(b);

                    }
                }
            });


            return b;
        })
        .map(function (b) {
            // resolve insertion overlaps array.push conflicts

            // iterate over A such that each overlapping splice
            // adjusts the path/offset of b
            A.forEach(function (a) {
                if (a.type === 'splice') {
                    if (pathOverlaps(a.path, b.path)) {
                        if (b.type === 'splice') {
                            b.offset += (a.value.length - a.removals);
                        } else {
                            // adjust the path of b to account for the splice
                        }
                    }
                }
            });
            return b;
        }));
};

// A, B, f, path, ops
var objects = OT.objects = function (A, B, path, ops) {
    var Akeys = Object.keys(A);
    var Bkeys = Object.keys(B);

    if (OT.type(ops) !== 'array') { ops = []; }

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
            return replace(ops, nextPath, B[b], old);
        }

        // else the key already existed
        var t_a = type(A[b]);
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

        // values might have changed, if not types
        if (['array', 'object'].indexOf(t_a) === -1) {
            // it's not an array or object, so we can do deep equality
            if (A[b] !== B[b]) {
                replace(ops, nextPath, B[b], old);
            }
            return;
        }

        if (t_a === 'object') {
            // it's an object
            OT.objects(A[b], B[b], nextPath, ops);
        } else {
            // it's an array
            OT.arrays(A[b], B[b], nextPath, ops);
        }
    });
    Akeys.forEach(function (a) {
        if (a === "on" || a === "_events") { return; }

        // the key was deleted
        if (Bkeys.indexOf(a) === -1 || type(B[a]) === 'undefined') {
            remove(ops, path.concat(a), A[a]);
        }
    });

    return ops;
};

var arrays = OT.arrays = function (o_A, B, path, ops) {
    if (OT.type(ops) !== 'array') { ops = []; }

    var A = o_A.slice(0);

    var l_A = A.length;
    var l_B = B.length;

    if (l_A !== l_B) {
        // B is longer than A
        // there has been an insertion (splice)

        // OR

        // A is longer than B
        // there has been a deletion

        var newMethod = 1;

        newMethod && (function () {
            var commonStart;
            var commonEnd;

            var i = 0;

            while (deepEqual(A[i], B[i])) { i++; }
            commonStart = i;

            i = 0;
            while (deepEqual(A[A.length - 1 - i],B[B.length - 1 - i])) { i++; }
            commonEnd = A.length - i;

            var insertion = B.slice(commonStart, commonEnd  + 1);

            //console.log(insertion);

            var removal = commonEnd - commonStart;

            // (ops, path,    offset, insertion, deletion, [value1, value2, ...])
            splice(ops, path, insertion, commonStart, removal);
        }());

        if (newMethod) { return ops; }

        // seeking to replace the code below...

        B.forEach(function (b, i) {
            var t_a = type(A[i]);
            var t_b = type(b);

            var old = A[i];
            var nextPath = path.concat(i);

            if (t_a !== t_b) {
                // type changes are always destructive
                // that's good news because destructive is easy
                if (t_b === 'undefined') {
                    // assumes that our input is coming from parsing a stringified array
                    throw new Error('this should never happen');
                }
                if (t_a === 'undefined' && i >= A.length) {
                    splice(ops, path, b, i, 0);
                } else {
                    replace(ops, nextPath, b, old);
                }
            } else {
                // same type
                switch (t_b) {
                    case 'object':
                        objects(A[i], b, nextPath, ops);
                        break;
                    case 'array':
                        arrays(A[i], b, nextPath, ops);
                        break;
                    default:
                        if (b !== A[i]) {
                            replace(ops, path, b, old); // VERIFY
                        }
                        break;
                }
            }
        });

        if (l_A > l_B) {
            // A was longer than B, so there have been deletions
            var i = l_B;
            var t_a;

            // iterate backwards, passing the value to remove
            for (; i <= l_B; i++) {
                remove(ops, path, A[i]);
            }
        }

        //A.length = l_B; ???
        return ops;
    }

    // else they are the same length, iterate over their values
    A.forEach(function (a, i) {
        var t_a = type(a);
        var t_b = type(B[i]);

        var old = a;

        var nextPath = path.concat(i);

        // they have different types
        if (t_a !== t_b) {
            if (t_b === 'undefined') {
                remove(ops, nextPath, old);
            } else {
                replace(ops, nextPath, B[i], old);
            }
            return;
        }

        // same type
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
                    replace(ops, nextPath, B[i], old);
                    //splice(ops, path, B[i], i, 1); // MAYBE?
                }
                break;
        }
    });
    return ops;
};

var diff = OT.diff = function (A, B) {
    var ops;

    var t_A = type(A);
    var t_B = type(B);

    if (t_A !== t_B) {
        throw new Error("Can't merge two objects of differing types");
    }

    if (t_B === 'array') {
        return arrays(A, B, [], ops);
    } else if (t_B === 'object') {
        return objects(A, B, [], ops);
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

