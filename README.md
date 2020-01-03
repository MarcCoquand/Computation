A port of Arrows to Typescript for Promises. Allows creating computations easily.

Useful when you are dealing with pipelines of async computations.

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
