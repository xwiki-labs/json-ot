(function (window) {
var main = function (OT, TextPatcher, Sortify) {
    //var ChainPad = window.ChainPad;
    var Operation = ChainPad.Operation;

    var JsonOT = {};

    var History = window.History = [];

    var now = function () { return +new Date(); };

    var naiveOT = JsonOT.naiveOT = function (text, toTransform, transformBy) {
        var DEBUG = window.REALTIME_DEBUG = window.REALTIME_DEBUG || {};

        var resultOp, text2, text3;
        try {
            resultOp = ChainPad.Operation.transform0(text, toTransform, transformBy);

            /*  if after operational transform we find that no op is necessary
                return null to ignore this patch */
            if (!resultOp) { return null; }

            text2 = ChainPad.Operation.apply(transformBy, text);
            text3 = ChainPad.Operation.apply(resultOp, text2);
            try {
                JSON.parse(text3);
                return resultOp;
            } catch (e) { }
        } catch (x) { }
        return null;
    };

    var validate = JsonOT.validate = function (text, toTransform, transformBy) {
        var DEBUG = window.REALTIME_DEBUG = window.REALTIME_DEBUG || {};

        var resultOp, text2, text3;
        try {
            // text = O (mutual common ancestor)
            // toTransform = A (your own operation)
            // transformBy = B (the incoming operation)
            // threeway merge (0, A, B)

            resultOp = ChainPad.Operation.transform0(text, toTransform, transformBy);

            /*  if after operational transform we find that no op is necessary
                return null to ignore this patch */
            if (!resultOp) { return null; }

            text2 = ChainPad.Operation.apply(transformBy, text);
            text3 = ChainPad.Operation.apply(resultOp, text2);
            try {
                JSON.parse(text3);
                return resultOp;
            } catch (e) {
                console.error(e);
                var info = DEBUG.ot_parseError = {
                    type: 'resultParseError',
                    resultOp: resultOp,

                    toTransform: toTransform,
                    transformBy: transformBy,

                    text1: text,
                    text2: text2,
                    text3: text3,
                    error: e
                };
                console.log('Debugging info available at `window.REALTIME_DEBUG.ot_parseError`');
            }
        } catch (x) {
            console.error(x);
            window.DEBUG.ot_applyError = {
                type: 'resultParseError',
                resultOp: resultOp,

                toTransform: toTransform,
                transformBy: transformBy,

                text1: text,
                text2: text2,
                text3: text3,
                error: x
            };
            console.log('Debugging info available at `window.REALTIME_DEBUG.ot_applyError`');
        }

        // returning **null** breaks out of the loop
        // which transforms conflicting operations
        // in theory this should prevent us from producing bad JSON
        return null;
    };

    var isCheckpoint = function (op, doc) {
        return op.offset === 0 &&
            op.toRemove === doc.length &&
            op.toInsert === doc;
    };

    /*  FIXME
        Had trouble with shared editing a <pre> block in the wysywyg.
        This suggests that there's a problem with the arbiter function,
        or perhaps in its usage.  */

    // arbiter function determines what to do in case of conflicts
    var arbiter = function (p_a, p_b, c) {
        if (p_a.prev !== p_b.prev) { throw new Error("Parent values don't match!"); }

        if (c === OT.cases.splice.splice) {
            console.log(p_a);
            console.log(p_b);
            return true;
        }
        var o = p_a.prev;
        var a = p_a.value;
        var b = p_b.value;

        var o_a = TextPatcher.diff(o, a);
        var o_b = TextPatcher.diff(o, b);

        /*  given the parent text, the op to transform, and the incoming op
            return a transformed operation which takes the incoming
            op into account */
        var o_x = Operation.transform0(o, o_b, o_a);

        // operations can be cancelled in transformation
        // if so, return 'true' to filter it from your changeset
        if (!o_x) { return true; }

        /*  Apply the incoming operation to the parent text
        */
        var x2 = Operation.apply(o_a, o);

        /*  Apply the transformed operation to the result of the incoming op
        */

        var x3 = Operation.apply(o_x, x2);

        p_b.value = x3;
    };

    var transform = JsonOT.transform = function (s_O, toTransform, transformBy, debug) {
        if (isCheckpoint(transformBy, s_O)) {
        /*  One of your peers sent a checkpoint
            this should have no effect on your current op */
            console.log('transforming on a checkpoint');
            return toTransform;
        }
        if (isCheckpoint(toTransform, s_O)) {
        /*  You're trying to send a checkpoint while receiving a patch
        */
            console.log("Pushing our own checkpoing through");
            return transformBy;
        }

        var msg;

        var O;
        var s_A;
        var A;
        var s_B;
        var B;

        var temp;
        try { O = JSON.parse(s_O); }
        catch (err) {
            msg = "original state was not valid json";
            console.error(msg);
            throw new Error(msg);
        }

        try {
            // parent state with incoming patch applied
            s_A = Operation.apply(transformBy, s_O);
            // parsed incoming state
            A = JSON.parse(s_A);
        }
        catch (err) {
            msg = 'incoming patch would result in invalid json';
            console.error(msg);
            throw new Error(msg);
        }

        try {
            // parent state with outgoing patch applied
            s_B = Operation.apply(toTransform, s_O);
            // parsed outgoing state
            B = JSON.parse(s_B);
        }
        catch (err) {
            msg = 'outgoing patch would result in invalid json';
            console.error(msg);
            throw new Error(msg);
        }

        try {
            // Diff of incoming state and parent state
            var o_A = OT.diff(O, A);

            // Diff of outgoing state and parent state
            var o_B = OT.diff(O, B);

            if (debug) {
                console.error(o_A);
                console.error(o_B);
            }

            // resolve changesets of A and B
            var C = OT.resolve(o_A, o_B, arbiter);

            if (debug) {
                console.log(C);
            }

            // Patch O for both sets of changes
            OT.patch(O, o_A);
            OT.patch(O, C);

            var s_C = Sortify(O);

            // isolate the merge artifact
            var d_C = TextPatcher.diff(s_A, s_C);

            if (!d_C) {
                msg = "Your operation was negated by an incoming operation";
                //console.error(msg);
                return null;
            }

            temp = Operation.apply(transformBy, s_O);
            temp = Operation.apply(d_C, temp);

            try {
                JSON.parse(temp);
            } catch (err) {
                console.error("transformed operation resulted in invalid json");
                throw err;
            }

            console.log({
                O: s_O,
                o_A: transformBy,
                o_B: toTransform,
                C: d_C,
            });

            return d_C;
        } catch (err) {
            console.error(err); // FIXME Path did not exist...
            return null;
        }
    };

    return JsonOT;
};

    if (typeof(module) !== 'undefined' && module.exports) {
        module.exports = main(
            require("./JSON-ot.js"),
            require("textpatcher"),
            require("json.sortify"),
            require("chainpad/chainpad.dist.js"));
    } else if ((typeof(define) !== 'undefined' && define !== null) && (define.amd !== null)) {
        define([
            '/bower_components/chainpad-json-validator/JSON-ot.js',
            '/bower_components/textpatcher/TextPatcher.js',
            'json.sortify',
            '/bower_components/chainpad/chainpad.dist.js',
        ], main);
    } else {
        window.Json_OT = main(); // GLHF
    }
}(this));
