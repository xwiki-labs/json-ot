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
            // toTransform = A (the first incoming operation)
            // transformBy = B (the second incoming operation)
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

    var transform = JsonOT.transform = function (s_O, toTransform, transformBy) {
        try { var O = JSON.parse(s_O); }
        catch (err) { throw new Error("original state was not valid json"); }

        try {
            // parent state with incoming patch applied
            var s_A = Operation.apply(toTransform, s_O);
            // parsed incoming state
            var A = JSON.parse(s_A);
        }
        catch (err) { throw new Error('outgoing patch would result in invalid json'); }

        try {
            // parent state with outgoing patch applied
            var s_B = Operation.apply(transformBy, s_O);
            // parsed outgoing state
            var B = JSON.parse(s_B);
        }
        catch (err) { throw new Error("wut"); }

        try {
            // apply the concerned operations, yielding stringified json

            // arbiter function determines what to do in case of conflicts
            var arbiter = function (p_a, p_b, c) {
                if (p_a.prev !== p_b.prev) { throw new Error("Parent values don't match!"); }

                var o = p_a.prev;
                var a = p_a.value;
                var b = p_b.value;

                var o_a = TextPatcher.diff(o, a);
                var o_b = TextPatcher.diff(o, b);

                /*  given the parent text, the op to transform, and the incoming op
                    return a transformed operation which takes the incoming
                    op into account */
                var o_x = Operation.transform0(o, o_b, o_a);

                /*  Apply the incoming operation to the parent text
                */
                var x2 = Operation.apply(o_a, o);

                /*  Apply the transformed operation to the result of the incoming op
                */
                var x3 = Operation.apply(o_x, x2);

                p_a.value = x3;

                return true;
            };

            // Diff of incoming state and parent state
            var o_A = OT.diff(O, A);

            // Diff of outgoing state and parent state
            var o_B = OT.diff(O, B);

            // resolve changesets of A and B

            /*  FIXME reversed these because otherwise splices happen in the wrong order
                [b, a] instead of [a, b] */

            var C = OT.resolve(o_A, o_B, arbiter, true);

            // Patch O for both sets of changes
            OT.patch(O, o_A);
            OT.patch(O, C);

            var s_C = Sortify(O);

            // isolate the merge artifact
            var d_C = TextPatcher.diff(s_A, s_C);

            if (d_C && false) {
                var delta = Operation.lengthChange(toTransform);
                var offset = d_C.offset - delta;

                var debugThis = 0;

                if (toTransform.offset < d_C.offset && ChainPad.Common.isUint(offset)) {
                    if (debugThis) {
                        console.log('transforming for: %s', s_O);
                        console.log(d_C);
                        console.log(toTransform);

                        console.log("result");
                    }

                    d_C.offset = offset;
                    if (debugThis) {
                        console.log(d_C);
                        console.log();
                    }
                }
            }

            var temp = Operation.apply(toTransform, s_O);
            temp = Operation.apply(d_C, temp);

            //console.log(temp);
            JSON.parse(temp);

            return d_C;
        } catch (err) {
            console.error(temp);
            console.error(err);

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
