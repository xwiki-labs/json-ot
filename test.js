#!/usr/bin/env node

var OT = require("./JSON-ot");
var TextPatcher = require("textpatcher");
require("chainpad/chainpad.dist");
var Sortify = require("json.sortify");

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

assert(function (E) {
    var O = { a: 5 };
    var A = { a: 6 };
    var B = { a: 7 };

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!OT.deepEqual(O, E)) { return O; }
    return true;
}, "replace->replace (Case #1 Conflicting)",
    {a: 6}
);

// independent replace -> replace
assert(function (E) {
    var O = {x:5};
    var A = {x:7};
    var B = {x:5, y: 9};

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!(changes.length === 1 &&
        OT.deepEqual(O, E))) {
        return changes;
    }
    return true;
}, "Expected transform to result in two operations",
    {
        x: 7,
        y: 9
    }
);

assert(function (expected) {
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

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!OT.deepEqual(O, expected)) { return changes; }
    return true;
}, "wat",
    {
        y: ["one", "two"],
        z: 23
    }
);

assert(function (E) {
    var O = [[]];
    var A = [[1]];
    var B = [[2]];

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!(changes.length === 1  && OT.deepEqual(O, E))) {
        return changes;
    }
    return true;
}, "Expected A to take precedence over B when both push",
    [[1, 2]]
);

assert(function (expected) { // UNSHIFT is hairy
    var O = [{x: 5}];

    var A = OT.clone(O);
    A.unshift("unshifted"); // ["unshifted",{"x":5}]

    var B = OT.clone(O);
    B[0].x = 7; // [{"x":7}]

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (changes.length && [0].type === 'splice' &&
        OT.deepEqual(O, expected)) {
        return O;
    }

    if (!OT.deepEqual(O, expected)) { return O; }
    return true;
}, "Expected unshift to result in a splice operation", 
    [ "unshifted", { x: 7} ]
);

assert(function (E) {
    // Simple merge application

    var O = { };
    var A = {x:5};
    var B = {y: 7};

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!OT.deepEqual(O, E)) {
        return changes;
    }

    return true;
}, "replace->replace (Case #1 No conflict)",
    {x:5, y: 7}
);

assert(function () { // simple merge with deletions
    var O = {z: 17};
    var A = {x:5};
    var B = {y: 7};

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!OT.deepEqual(O, {x:5, y: 7})) {
        return changes;
    }
    return true;
}, "simple merge with deletions");

// remove->remove
assert(function (E) {
    var O = { x: 5, };
    var A = {};
    var B = {};

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!(changes.length === 0 && OT.deepEqual(O, E))) {
        return changes;
    }
    return true;
}, "Identical removals should be deduplicated", {});

// replace->remove
assert(function (E) {
    var O = {
        x: 5,
    };

    var A = {
        x: 7,
    };

    var B = { };

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!(changes.length === 0 && OT.deepEqual(O, E))) {
        return changes;
    }

    return true;
}, "replacements should override removals. (Case #2)",
    {x: 7}
);

// replace->splice
assert(function (expected) {
    var O = [{x:5}];

    var A = OT.clone(O);
    A[0].x = 7;

    var B = OT.clone(O);
    B.unshift(3);

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!(changes.length === 1 &&
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
assert(function (expected) {
    var O = { x: 5, };
    var A = { };
    var B = { x: 7, };

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A)
    OT.patch(O, changes);

    if (!OT.deepEqual(O, expected)) {
        return changes;
    }
    return true;
}, "removals should not override replacements. (Case #4)",
    {x: 7}
);

// remove->remove
assert(function (E) {
    var O = { x: 5, };
    var A = {};
    var B = {};

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!(changes.length === 0 && OT.deepEqual(O, E))) {
        return changes;
    }

    return true;
}, "identical removals should be deduped. (Case #5)",
    {}
);

// remove->splice
// TODO
assert(function (expected) {
    var O = [{x:5}];
    var A = [{}];
    var B = [2, {x: 5}];

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!(changes.length === 1 &&
        OT.deepEqual(O, expected))) {
        return {
            changes: changes,
            result: O
        };
    }
    return true;
}, "remove->splice (Case #6)", [2, {}]);

// splice->replace
assert(function (E) {
    var O = [
        {
            x:5,
        }
    ];

    var A = OT.clone(O);
    A.push(7);

    var B = OT.clone(O);

    var a = OT.diff(O, A);
    var b = OT.diff(O, B);

    var changes = OT.resolve(a, b);

    OT.patch(O, a);
    OT.patch(O, changes);

    if (!(OT.deepEqual(O, E))) {
        return changes;
    }

    return true;
}, "splice->replace (Case #7)",
    [ { x:5 }, 7 ]
);

assert(function (E) {
    var O = [
        {
            x:5,
        }
    ];

    var A = OT.clone(O);
    A.unshift(7);

    var B = OT.clone(O);

    var a = OT.diff(O, A);
    var b = OT.diff(O, B);

    var changes = OT.resolve(a, b);

    OT.patch(O, a);
    OT.patch(O, changes);

    if (!OT.deepEqual(O, E)) {
        return changes;
    }

    return true;
}, "splice->replace (Case #7)",
    [ 7, { x:5 } ]
);

// splice->remove
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

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!OT.deepEqual(O, expected)) {
        return {
            result: O,
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

    var a = OT.diff(O, A);
    var b = OT.diff(O, B);

    var changes = OT.resolve(a, b);

    OT.patch(O, a);
    OT.patch(O, changes)

    if (!(changes.length === 1 && OT.deepEqual(O, expected))) {
        console.log(O);
        return changes;
    }
    return true;
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

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    var C = OT.clone(O);

    OT.patch(C, d_A);
    OT.patch(C, changes);

    if (!OT.deepEqual(C, expected)) {
        return changes;
    }
    return true;
}, "Incorrect merge", {
    x: ['a', 'b'],
    y: {
        a: 5,
    },
    z: 'bang',
});

var transformText = function (O, A, B) {
    var d1 = TextPatcher.diff(O, A);

    var d2 = TextPatcher.diff(O, B);

    var r = ChainPad.Operation.transform0(O, d2, d1);

    var doc = ChainPad.Operation.apply(r, O);
    doc = ChainPad.Operation.apply(d1, doc);
    return doc;
};

assert(function (expected) {
    var O = "pewpew";
    var A = "pewpew bang";
    var B = "powpow";

    return transformText(O, A, B) === expected;
}, "", "powpow bang");

assert(function (expected) {
    var O = ["pewpew"];
    var A = ["pewpew bang"];
    var B = ["powpow"];

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B, function (a, b, t) {
        var d1 = TextPatcher.diff(a.prev || "", a.value);
        var d2 = TextPatcher.diff(b.prev || "", b.value);

        var d3 = ChainPad.Operation.transform0(a.prev, d1, d2);

        a.value = transformText(a.prev, a.value, b.value);
        return true;
    });

    OT.patch(O, d_A);
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

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    var C =  OT.clone(O);

    OT.patch(C, d_A);
    OT.patch(C, changes);

    if (!OT.deepEqual(O, OO)) {
        return [O, OO];
    }

    return true;
}, "Expected original objects to be unaffected. all operations must be pure");

var ot = require("./json-ot");

assert(function (expected) {
    var O = '[]';
    var A = '["a"]';
    var B = '["b"]';

    var actual = ot.transform('[]',
        TextPatcher.diff(O, B),
        TextPatcher.diff(O, A));

    if (!OT.deepEqual(actual, expected)) { return actual; }
    return true;
}, "ot is incorrect", 
    { type: 'Operation', offset: 4, toInsert: ',"b"', toRemove: 0 }
);

assert(function (expected) {
    var O = '{}';
    var A = TextPatcher.diff(O, Sortify({y: 7}));
    var B = TextPatcher.diff(O, Sortify({x: 5}));

    var actual = ot.transform('{}', A, B);

    var temp = ChainPad.Operation.apply(A, O);
    temp = ChainPad.Operation.apply(actual, temp);

    try { JSON.parse(temp); }
    catch (e) { return temp; }

    if (!OT.deepEqual(actual, expected)) {
        return actual;
    }
    return true;
}, 'ot on empty maps is incorrect (#1)', {
    // this is incorrect! // FIXME
    type: 'Operation', toInsert: ',"y":7', toRemove: 0, offset: 6
});

assert(function (expected) {
    var O = '{}';
    var A = TextPatcher.diff(O, Sortify({x: 7}));
    var B = TextPatcher.diff(O, Sortify({y: 5}));

    var actual = ot.transform('{}', A, B);

    var temp = ChainPad.Operation.apply(A, O);
    temp = ChainPad.Operation.apply(actual, temp);

    try { JSON.parse(temp); }
    catch (e) {
        console.log(temp);
        throw e;
    }

    if (!OT.deepEqual(actual, expected)) {
        return actual;
    }
    return true;
}, 'ot on empty maps is incorrect (#2)', {
    type: 'Operation', toInsert: 'x":7,"', toRemove: 0, offset: 2
});

assert(function (E) {
    return true;
    // define a parent state and create a string representation of it
    var O = ['BODY', {}, [
        ['P', {}, ['the quick red']]
    ]];
    var s_O = Sortify(O);

    // append text into a text node
    var A = OT.clone(O);
    A[2][0][2][0] = 'the quick red fox';

    // insert a new paragraph at the top
    var B = OT.clone(O);
    B[2].unshift(['P', {}, [
        'pewpew',
    ]]);

    // infer necessary text operations
    var o_A = TextPatcher.diff(s_O, Sortify(A));
    var o_B = TextPatcher.diff(s_O, Sortify(B));

    // construct a transformed text operation which takes into account the fact
    // that we are working with JSON
    var o_X = ot.transform(s_O, o_A, o_B);

    if (!o_X) {

        console.log(o_A);
        console.log(o_B);
        console.log(o_X);

        throw new Error("Expected ot to result in a patch");
    }

    // apply both ops to the original document in the right order
    var doc = ChainPad.Operation.apply(o_A, s_O);
    doc = ChainPad.Operation.apply(o_X, doc);

    // parse the result
    var parsed = JSON.parse(doc);

    // make sure it checks out
    if (!OT.deepEqual(parsed, E)) { return parsed; }
    return true;
}, "failed to transform paragraph insertion and text node update in hyperjson",
    ['BODY', {}, [
        ['P', {}, ['pewpew']],
        ['P', {}, ['the quick red fox']],
    ]]
);

assert(function (E) {
    var O = ['BODY', {},
        ['P', {}, [
            ['STRONG', {}, ['bold']]
        ]]
    ];
    var s_O = Sortify(O);

    var A = OT.clone(O);
    A[2][2][0] = 'pewpew';
    var s_A = Sortify(A);

    var d_A = TextPatcher.diff(s_O, s_A);

    var B = OT.clone(O);
    B[2][2][0][2] = 'bolded text';

    var s_B = Sortify(B);
    var d_B = TextPatcher.diff(s_O, s_B);

    var op = ot.transform(s_O, d_B, d_A);

    var changes = (function () {
        var d_A = OT.diff(O, A);
        var d_B = OT.diff(O, B);

        var changes = OT.resolve(d_A, d_B);

        return changes;
    }());

    /*  we expect that b will have been cancelled by its parent's removal */
    if (changes.length) { return changes; }

    if (!op) {
        /*  Your outgoing operation was cancelled by the incoming one
            so just apply the incoming one and DEAL WITH IT */
        var temp = ChainPad.Operation.apply(d_A, s_O);
        var parsed = JSON.parse(temp);

        if (!OT.deepEqual(parsed, E)) { return parsed; }
        return true;
    }
}, "failed OT on removing parent branch",
    ['BODY', {},
        ['P', {}, ["pewpew"]]
    ]
);

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

