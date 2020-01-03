type Either<A, B> = { kind: 'LEFT'; value: A } | { kind: 'RIGHT'; value: B };

/**
 * A Computation is an async pipeline from I (I = Input) to Promise<O> (O = Output).
 * If you have an activity diagram of your system and it uses promises, it might model
 * well with arrows!
 *
 * Quote from https://www.haskell.org/arrows/
 *
 * Arrows are a new abstract view of computation, defined by John Hughes. They
 * serve much the same purpose as monads -- providing a common structure for
 * libraries -- but are more general. In particular they allow notions of
 * computation that may be partially static (independent of the input) or may
 * take multiple inputs.
 *
 * Useful paper:
 * http://www.cse.chalmers.se/~rjmh/Papers/arrows.pdf
 */
export class Computation<I, O> {
    /**
     * Run the computation, resulting in a Promise<O>. Remember to handle errors!
     */
    run: (input: I) => Promise<O>;

    /**
     * Pure map of the successful output.
     *
     * Intution: Give me a computation from I to O and a way to transform O to N
     * Then I can give you a way to transform I to N.
     * ```
     * (O -> N) -> arrow (I -> O) -> arrow (I -> N)
     *
     *
     * I -> O -> N
     * ```
     */
    mapOutput = <N>(mapper: (output: O) => N): Computation<I, N> =>
        new Computation(input =>
            this.run(input).then(result => mapper(result))
        );

    /**
     * A.K.A. precompose or contramap
     *
     * Intuition: Give me a computation from I to O and a way to transform N to I
     * Then I can give you a way to transform N to O.
     * ```
     * (N -> I) -> arrow (I -> O) -> arrow (N -> O)
     * N -> I -> O
     * ```
     */
    mapInput = <N>(mapper: (input: N) => I): Computation<N, O> =>
        new Computation(input => this.run(mapper(input)));

    /**
     * Run two computations async and collect their results
     *
     * ```
     *      -> O
     *     /
     * I -<
     *     \
     *      -> O2
     * ```
     */
    branch = <O2>(computation: Computation<I, O2>): Computation<I, [O, O2]> =>
        new Computation(async input => {
            const result1 = await this.run(input);
            const result2 = await computation.run(input);
            return [result1, result2];
        });

    /**
     * Pair two computations together
     *
     * ```
     * I  -> O
     * I2 -> O2
     * ```
     */
    pair = <I2, O2>(
        computation: Computation<I2, O2>
    ): Computation<[I, I2], [O, O2]> =>
        new Computation(input =>
            Promise.all([this.run(input[0]), computation.run(input[1])])
        );

    /**
     * Perform another computation after the first one, just like .then for
     * promises.
     *
     * ```
     * I -> O -> O2
     * ```
     */
    andThen = <O2>(computation: Computation<O, O2>): Computation<I, O2> =>
        new Computation(input =>
            this.run(input).then(output => computation.run(output))
        );

    /**
     * Perform a computation on the second input. Useful in conjunction with
     * branch and pair.
     *
     * ```
     * -> D -> D
     * -> I -> O
     * ```
     */
    static second = <I, O, D>(
        computation: Computation<I, O>
    ): Computation<[D, I], [D, O]> =>
        new Computation(input =>
            computation.run(input[1]).then(output => [input[0], output])
        );

    /**
     * Perform a computation on the first input. Useful in conjunction with
     * branch and pair.
     *
     * ```
     * -> I -> O
     * -> D -> D
     * ```
     */
    static first = <I, O, D>(
        computation: Computation<I, O>
    ): Computation<[I, D], [O, D]> =>
        new Computation(input =>
            computation.run(input[0]).then(output => [output, input[1]])
        );

    /**
     * Split the output into two. Useful in conjunction with branch, first, second.
     *
     * Note that it will only perform the side effect once. If you wish to perform
     * the side effect twice (maybe you want different values) then use:
     * ```
     * computation.branch(computation)
     * ```
     * ```
     *      -> O
     *    /
     * I -
     *    \
     *      -> O
     * ```
     */
    static split = <I, O>(
        computation: Computation<I, O>
    ): Computation<I, [O, O]> =>
        new Computation(async input => {
            const result = await computation.run(input);
            return [result, result];
        });

    /**
     * Add another computation to your computation, creating a new computation
     * that support multiple inputs. Use Computation.runLeft to compute on `I`
     * and Computation.runRight to compute on `I2`.
     *
     * ```
     * I OR I2 -> O OR O2
     * ```
     */
    add = <I2, O2>(
        computation: Computation<I2, O2>
    ): Computation<Either<I, I2>, Either<O, O2>> =>
        new Computation(async input => {
            switch (input.kind) {
                case 'LEFT':
                    const result1 = await this.run(input.value);
                    return { kind: 'LEFT', value: result1 };
                case 'RIGHT':
                    const result2 = await computation.run(input.value);
                    return { kind: 'RIGHT', value: result2 };
            }
        });

    /**
     *  Add another computation which yields the same output, creating a new
     *  computation that supports multiple inputs. Use Computation.runLeft to
     *  compute on `I` and Computation.runRight to compute on `I2`.
     *
     * ```
     * I OR I2 -> O
     * ```
     */
    fanIn = <I2>(
        computation: Computation<I2, O>
    ): Computation<Either<I, I2>, O> =>
        new Computation(input => {
            switch (input.kind) {
                case 'LEFT':
                    return this.run(input.value);
                case 'RIGHT':
                    return computation.run(input.value);
            }
        });

    /**
     * Create a new computation for an async function.
     *
     * @param fun an async operation
     *
     * ```
     * const fetchComputation = new Computation(url => fetch(url))
     * // Somewhere
     * try {
     *   fetchComputation.run(myUrl)
     * }
     * catch(error) {
     *  console.log(error)
     * }
     * ```
     */
    constructor(fun: (input: I) => Promise<O>) {
        this.run = fun;
    }

    /**
     * Apply a computation on the left argument
     *
     * ```
     * I OR D -> if I then O else D
     * ```
     */
    static left = <I, O, D>(
        computation: Computation<I, O>
    ): Computation<Either<I, D>, Either<O, D>> =>
        new Computation(async input => {
            switch (input.kind) {
                case 'LEFT':
                    const result1 = await computation.run(input.value);
                    return { kind: 'LEFT', value: result1 };
                case 'RIGHT':
                    const result2 = await Promise.resolve(input.value);
                    return { kind: 'RIGHT', value: result2 };
            }
        });

    /**
     * Apply a computation on the right argument
     *
     * ```
     * D OR I -> if I then O else D
     * ```
     */
    static right = <I, O, D>(
        computation: Computation<I, O>
    ): Computation<Either<D, I>, Either<D, O>> =>
        new Computation(async input => {
            switch (input.kind) {
                case 'LEFT':
                    const result1 = await Promise.resolve(input.value);
                    return { kind: 'LEFT', value: result1 };
                case 'RIGHT':
                    const result2 = await computation.run(input.value);
                    return { kind: 'RIGHT', value: result2 };
            }
        });

    /**
     * Given a computation that accepts `I1` and `I2`, run it with the value `I1`,
     * resulting in `O`.
     */
    static runLeft = <I1, I2, O>(
        computation: Computation<Either<I1, I2>, O>,
        value: I1
    ) => computation.run({ kind: 'LEFT', value });

    /**
     * Given a computation that accepts `I1` and `I2`, run it with the value `I2`,
     * resulting in `O`.
     */
    static runRight = <I1, I2, O>(
        computation: Computation<Either<I1, I2>, O>,
        value: I2
    ) => computation.run({ kind: 'RIGHT', value });

    /**
     * Merge two inputs into one
     *
     * ```
     * I1 -
     *      \
     *        -> O
     *      /
     * I2 -
     * ```
     * Example:
     * ```
     * const getFirstNumber: Computation<I, number> = ...
     * const getSecondNumber: Computation<I, number> = ...
     *
     * const sum = getFirstNumber.branch(getSecondNumber).merge((n1,n2) => n1+n2)
     * ```
     */
    static merge = <I1, I2, O>(merger: (first: I1, second: I2) => O) =>
        new Computation((input: [I1, I2]) =>
            Promise.resolve(merger(input[0], input[1]))
        );
}
