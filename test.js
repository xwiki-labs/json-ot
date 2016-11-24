#!/usr/bin/env node

var OT = require("./JSON-ot");
var TextPatcher = require("textpatcher");
require("chainpad/chainpad.dist");

var assertions = 0;
var failed = false;
var failedOn;
var failMessages = [];

var ASSERTS = [];

var runASSERTS = function () {
    ASSERTS.forEach(function (f, index) {
        f(index + 1);
    });
};

var assert = function (test, msg, expected) {
    ASSERTS.push(function (i) {
        var returned = test(expected);
        if (returned === true) {
            assertions++;
            return;
        }
        failed = true;
        failedOn = assertions;
        failMessages.push({
            test: i,
            message: msg,
            output: returned,
            expected: typeof(expected) !== 'undefined'? expected: true,
        });
    });
};

assert(function () {
    var O = {x:5};
    var C = OT.clone(O);

    return O !== C;
}, "Expected object identity to fail on cloned objects");

assert(function () {
    return OT.pathOverlaps(['a', 'b', 'c'],
        ['a', 'b', 'c', 'd']);
}, "child elements have overlapping paths");

assert(function () {
    return !OT.pathOverlaps(['a', 'b', 'c'],
        ['a', 'b', 'd', 'e']);
}, "sibling elements do not overlap");

assert(function () {
    var A = [
        {
            x: 5,
            y: [
                1,
                2,
                3,
            ],
            z: 15
        },
        "pewpew",
        23
    ];

    var B = OT.clone(A);

    return OT.deepEqual(A, B);
}, "Expected deep equality");

assert(function () {
    var A = [
        {
            x: 5,
            y: [
                1,
                2,
                3,
            ],
            z: 15
        },
        "pewpew",
        23
    ];

    var B = OT.clone(A);
    B[0].z = 9;

    return !OT.deepEqual(A, B);
}, "Expected deep inequality");

assert(function () {
    var A = [1, 2, {
        x: 7
    }, 4, 5, undefined];

    var B = [1, 2, {
        x: 7,
    }, 4, 5];

    return !OT.deepEqual(A, B);
}, "Expected deep inequality");

assert(function () {
    var A = {
        x: 5,
        y: 7
    };

    var B = {
        x: 5,
        y: 7,
        z: 9
    };
    return !OT.deepEqual(A, B);
}, "Expected deep inequality");

var changeSet = function (O, A, B) {
    return OT.resolve(OT.diff(O, A), OT.diff(O, B));
};

assert(function () {
    var O = { a: 5 };
    var A = { a: 6 };
    var B = { a: 7 };

    var changes = changeSet(O, A, B);
    OT.patch(O, changes);

    if (!(changes.length === 1 && OT.deepEqual(O, {a:6}))) {
        return changes;
    }
    return true;
}, "replace->replace (Case #1 Conflicting)");

// independent replace -> replace
assert(function () {
    var O = {x:5};
    var A = {x:7};
    var B = {x:5, y: 9};

    var changes = changeSet(O, A, B);
    OT.patch(O, changes);

    return changes.length === 2 &&
        OT.deepEqual(O, {
            x: 7,
            y: 9
        });
}, "Expected transform to result in two operations");

assert(function () {
    var O = {
        x: 5,
    };
    var A = {
        x: 5,
        y: [
            "one",
            "two",
        ]
    };
    var B = {z: 23};

    var changes = changeSet(O, A, B);
    //console.log(changes);

    return changeSet.length === 3;
}, "");

assert(function () {
    var O = [[]];
    var A = [[1]];
    var B = [[2]];

    var changes = changeSet(O, A, B);

    OT.patch(O, changes);

    //console.log(
    if (!(changes.length === 2 && changes[1].offset === 1 &&
        OT.deepEqual(O, [[1,2]]))) {
        //console.log(changes);
        return O;
    }
    return true;
}, "Expected A to take precedence over B when both push");

assert(function (expected) { // UNSHIFT is hairy
    var O = [{x: 5}];

    var A = OT.clone(O);
    A.unshift("unshifted");

    var B = OT.clone(O);
    B[0].x = 7;

    var changes = changeSet(O, A, B);

    //console.log(changes);
    OT.patch(O, changes);

    if (changes.length && [0].type === 'splice' &&
        OT.deepEqual(O, expected)) {
        return O;
    }
    return true;
}, "Expected unshift to result in a splice operation", [
    'unshifted',
    {
        x: 7,
    }
]);

assert(function () {
    // Simple merge application

    var O = { };
    var A = {x:5};
    var B = {y: 7};

    var changes = changeSet(O, A, B);
    OT.patch(O, changes);

    return OT.deepEqual(O, {x:5, y: 7});
}, "replace->replace (Case #1 No conflict)");

assert(function () { // simple merge with deletions
    var O = {z: 17};
    var A = {x:5};
    var B = {y: 7};

    var changes = changeSet(O, A, B);
    OT.patch(O, changes);

    return OT.deepEqual(O, {x:5, y: 7});
}, "simple merge with deletions");

// remove->remove
assert(function () {
    var O = { x: 5, };
    var A = {};
    var B = {};

    var changes = changeSet(O, A, B);

    OT.patch(O, changes);

    return changes.length === 1 && OT.deepEqual(O, {});
}, "Identical removals should be deduplicated");

// replace->remove
assert(function () {
    var O = {
        x: 5,
    };

    var A = {
        x: 7,
    };

    var B = { };

    var changes = changeSet(O, A, B);

    //console.log(changes);

    OT.patch(O, changes);
    return changes.length === 1 && OT.deepEqual(O, { x: 7 });
}, "replacements should override removals. (Case #2)");

// replace->splice
// TODO
assert(function (expected) {
    var O = [{x:5}];

    var A = OT.clone(O);
    A[0].x = 7;

    var B = OT.clone(O);
    B.unshift(3);

    var changes = changeSet(O, A, B);
    OT.patch(O, changes);

    if (!(changes.length === 2 &&
        OT.deepEqual(O, expected))) {
        return {
            changes: changes,
            result: O,
        };
    }
    return true;
}, "replace->splice (Case #3)",

[3, {x: 7}]
);

// remove->replace
assert(function () {
    var O = { x: 5, };
    var A = { };
    var B = { x: 7, };

    var changes = changeSet(O, A, B);
    OT.patch(O, changes);

    if (!(changes.length === 1 && OT.deepEqual(O, { x: 7 }))) {
        //console.log(changes);
        //console.log(O);
        return changes;
    }
    return true;
}, "removals should not override replacements. (Case #4)");

// remove->remove
assert(function () {
    var O = { x: 5, };
    var A = {};
    var B = {};

    var changes = changeSet(O, A, B);

    OT.patch(O, changes);

    return changes.length === 1 && OT.deepEqual(O, {})
}, "identical removals should be deduped. (Case #5)");

// remove->splice
// TODO
assert(function (expected) {
    var O = [{x:5}];
    var A = [{}];
    var B = [2, {x: 5}];

    var changes = changeSet(O, A, B);
    OT.patch(O, changes);

    if (!(changes.length === 2 &&
        OT.deepEqual(O, expected))) {
        return {
            changes: changes,
            result: O
        };
    }
    return true;
}, "remove->splice (Case #6)", [2, {}]);

// splice->replace
assert(function () {
    var O = [
        {
            x:5,
        }
    ];

    var A = OT.clone(O);
    A.push(7);

    var B = OT.clone(O);

    var changes = changeSet(O, A, B);
    OT.patch(O, changes);

    if (!(OT.deepEqual(O, [ { x:5 }, 7 ]))) {
        return changes;
    }

    return true;
}, "splice->replace (Case #7)");

assert(function () {
    var O = [
        {
            x:5,
        }
    ];

    var A = OT.clone(O);
    A.unshift(7);

    var B = OT.clone(O);


    var changes = changeSet(O, A, B);
    OT.patch(O, changes);

    if (!OT.deepEqual(O, [ 7, { x:5 } ])) {
        return changes;
    }

    return true;
}, "splice->replace (Case #7)");

// splice->remove
// FIXME
assert(function (expected) {
    var O = [
        1,
        {
            x: 5,
        }
    ];

    var A = [
        1,
        2,
        {
            x: 5,
        }
    ];

    var B = [
        1,
        {}
    ];

    ///var changes = changeSet(O, A, B);

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, changes);

    if (!(changes.length == 2 && OT.deepEqual(O, expected))) {
        //console.log(changes);
        return {
            result: O,
            //d_A: d_A,
            //d_B: d_B,
            changes: changes
        };
        return changes;
    }

    return true;
}, "splice->remove (Case #8)", [1, 2, {}]);

// splice->splice
assert(function (expected) {
    var O = [];
    var A = ["one"];
    var B = ["two"];

    var changes = changeSet(O, A, B);
    OT.patch(O, changes)

    return changes.length === 2 && OT.deepEqual(O, expected);
}, "splice->splice (Case #9)", ['one', 'two']);

assert(function (expected) {
    var O = {
        x: [],
        y: { },
        z: "pew",
    };

    var A = OT.clone(O);
    var B = OT.clone(O);

    A.x.push("a");
    B.x.push("b");

    A.y.a = 5;
    B.y.a = 7;

    A.z = "bang";
    B.z = "bam!";

    var changes = changeSet(O, A, B);

    var C = OT.clone(O);
    OT.patch(C, changes);

    if (!OT.deepEqual(C, expected)) {
        console.log(changes);
        return;
    }
    return true;
}, "Incorrect merge", {
    x: ['a', 'b'],
    y: {
        a: 5,
    },
    z: 'bang',
});

/*
var Op = {
    apply: function (doc, op) {
        return doc.slice(0,op.offset) +
            op.toInsert + doc.slice(op.offset + op.toRemove);
    },
    equal: function (a, b) {
        return a.offset === b.offset &&
            a.toInsert === b.toInsert &&
            a.toRemove === b.toRemove;
    },
    transform: function (t, a, b) {
        if (Op.equal(a, b)) { return a; }

        var s = [a, b].sort(function (x, y) {
            return x.offset - y.offset;
        }).reduce(function (x, y) {
            var tmp = Op.apply(t, a);
            b.offset += a.offset - a.toRemove;
            return Op.apply(tmp, b);
        });

        console.log(s);
        return s;
    },
};*/

var transformText = function (O, A, B) {
    var d1 = TextPatcher.diff(O, A);

    //console.log(d1);
    var d2 = TextPatcher.diff(O, B);

    var r = ChainPad.Operation.transform0(O, d2, d1);

    var doc = ChainPad.Operation.apply(r, O);
    doc = ChainPad.Operation.apply(d1, doc);
    return doc;
};

//false && 
assert(function (expected) {
    var O = "pewpew";
    var A = "pewpew bang";
    var B = "powpow";

/*

    console.log({
        doc: doc,
        r: r,
        O: O,
        A: A,
        B: B,
        d1: d1,
        d2: d2,
    });*/
    return transformText(O, A, B) === expected;
}, "", "powpow bang");

//false && 
assert(function (expected) {
    var O = ["pewpew"];
    var A = ["pewpew bang"];
    var B = ["powpow"];

    var changes = changeSet(O, A, B);

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B, function (a, b, t) {
        var d1 = TextPatcher.diff(a.prev || "", a.value);
        var d2 = TextPatcher.diff(b.prev || "", b.value);

        var d3 = ChainPad.Operation.transform0(a.prev, d1, d2);

        a.value = transformText(a.prev, a.value, b.value);

/*      console.log("Arbiter this!");
        console.log(JSON.stringify({
            a:a,
            b:b,
            d1:d1,
            d2:d2,
            d3: d3,
            t:t
        }, null, 2));*/
        return true;
    });

    //console.log(changes);
    OT.patch(O, changes);

    if (!OT.deepEqual(O, expected)) {
        return {
            result: O,
            changes: changes,
        };
    }
    return true;
}, "diff/patching strings with overlaps", ["powpow bang"]);

// TODO
assert(function () {
    var O = {
        v: {
            x: [],
        },
    };

    var OO = OT.clone(O);

    var A = {};
    var B = {b: 19};

    var changes = changeSet(O, A, B);

    var C =  OT.clone(O);

    OT.patch(C, changes);

    if (!OT.deepEqual(O, OO)) {
        return [O, OO];
    }

    return true;
}, "Expected original objects to be unaffected. all operations must be pure");

var isTransitive = function (O, A, B, C, m) {
    var c_A = changeSet(O, A, B);
    var c_B = changeSet(O, B, A);

    var R = [c_A, c_B].map(function (c) {
        var o = OT.clone(O);
        OT.patch(o, c);
        return o;
    });

    assert(function (C) {
        if (!OT.deepEqual(R[0], C)) {
            console.error("Result was not equal to expectation!");
            return [R[0], C];
        }
        if (!OT.deepEqual(R[0], R[1])) {
            console.log("Expected opposing transformations to produce equivalent output!");
            return R;
        }
        return true;
    }, m, C);
};

var ot = require("./json-ot");

assert(function (expected) {
    var actual = ot.transform('[]',
        {type:'Operation', offset: 1, toInsert: '"a"', toRemove: 0},
        {type:'Operation', offset: 1, toInsert: '"b"', toRemove: 0});

    if (!OT.deepEqual(actual, expected)) {
        return actual;
    }
    return true;
}, "ot is incorrect", 
    { type: 'Operation', offset: 1, toInsert: ',"b"', toRemove: 0 }
);

// HERE

0 && isTransitive({}, {x: 5}, {y: 7}, {
    x:5, y:7
}, "pewpew!");

0 && isTransitive([''], ['pew'], ['bang'], ['pewbang'], 'string transformations');

0 && isTransitive([], ['umm'], ['bang'], ['umm', 'bang'], "array transformations");


runASSERTS();

if (failed) {
    failMessages.forEach(function (msg) {
        console.log("\n" + Array(64).fill("=").join(""));
        console.log(JSON.stringify(msg, null, 2));
    });
    console.log("\n%s assertions passed and %s failed", assertions, failMessages.length);

    process.exit(1);
}

console.log("[SUCCESS] %s tests passed", assertions);

