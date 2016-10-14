# JSON OT

```
var O = { x: 5, };
var A = { x: 7, };
var B = { x: 5, y: 9, };

var a = diff(O, A); // update [x] -> 7
var b = diff(O, B); // insert [y] -> 9

var changes = resolve(a, b)
/*
    [
        {
            type: 'update',
            path: ['x'],
            value: 7,
        },
        {
            type: 'insert',
            path: ['y'],
            value: 9,
        }
    ]
*/

// result
var R = OT.patch(O, changes);

/*
    {
        x: 7,
        y: 9,
    }
*/
```

// operation(type, path, value);

