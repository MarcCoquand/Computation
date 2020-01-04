A port of Arrows to Typescript for Promises for creating compuations.

This library is quite complex, however, that complexity might be worth it
when you are dealing with complex pipelines of async computations, especially
if parts of that pipeline are dynamic.

```
import {Computation} from 'computation'
const request1 = new Computation(query => fetch(withQuery(url,query)))
const request2 = new Computation(query => fetch(withQuery(url2,query)))

const fetchBoth = request1.branch(request2)

try {
    await fetchBoth('myUniversalQuery=myUniversalQuery')
}
catch(e) {
    console.log(e)
}
```

See more documentation in the file src/computation.ts of available methods or
the related paper http://www.cse.chalmers.se/~rjmh/Papers/arrows.pdf.

TODO:
Add more documentation
