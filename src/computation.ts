/**
 * A Computation is an async pipeline from I (I = Input) to Promise<O> (O =
 * Output). So, for example, `Computation<Request,User>` can be read as
 * `(request: Request) => Promise<User>`.
 *
 * If you have a complex activity diagram of your system and it uses promises,
 * it might model well with computations!
 *
 *
 * Quote from https://www.haskell.org/arrows/
 *
 * Arrows (Haskell's name for Computation) are a new abstract view of
 * computation, defined by John Hughes. They serve much the same purpose as
 * monads -- providing a common structure for libraries -- but are more
 * general. In particular they allow notions of computation that may be
 * partially static (independent of the input) or may take multiple inputs.
 *
 * Related paper:
 * http://www.cse.chalmers.se/~rjmh/Papers/arrows.pdf
 */
export class Computation<I, O> {
  // state is used to keep track if union is left or right. This allows for a
  // more ergonomic interface rather than using a Either type.
  private runF: (input: I) => Promise<O>;

  /**
   * Transformation of the successful output.
   *
   * Intution: Give me a computation from `I` to `O` and a way to transform `O` to `N`
   * Then I can give you a computation from `I` to `N`.
   * ```
   * (O -> N) -> arrow (I -> O) -> arrow (I -> N)
   * I -> O -> N
   * ```
   */
  map = <N>(mapper: (output: O) => N): Computation<I, N> =>
    new Computation((input: I) =>
      this.runF(input).then(result => mapper(result))
    );

  /**
   * Transform the input of the computation.
   *
   * Intuition: Give me a computation from `I` to `O` and a way to transform `N` to `I`
   * Then I can give you a way to computation from `N` to `O`. In map, `N` gets
   * added at the end of the pipeline; contramap adds `N` at the
   * start of the pipeline.
   * ```
   * N -> I -> O
   * ```
   */
  contramap = <N>(mapper: (input: N) => I): Computation<N, O> =>
    new Computation(input => this.runF(mapper(input)));

  /**
   * Run two computations async and collect their results
   *
   * ```
   *      -> O
   *     /
   * I -
   *     \
   *      -> O2
   * ```
   */
  branch = <O2>(computation: Computation<I, O2>): Computation<I, [O, O2]> =>
    new Computation(async input =>
      Promise.all([this.runF(input), computation.runF(input)])
    );

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
      Promise.all([this.runF(input[0]), computation.runF(input[1])])
    );

  /**
   * Perform another computation after the first one, exactly like .then for
   * promises.
   *
   * ```
   * I -> O -> O2
   * ```
   */
  then = <O2>(computation: Computation<O, O2>): Computation<I, O2> =>
    new Computation(input =>
      this.runF(input).then(output => computation.runF(output))
    );

  /**
   * Perform a computation on the second input. Useful in conjunction with
   * branch and pair.
   *
   * ```
   * -> Extra -> Extra
   * -> I     -> O
   * ```
   */
  static second = <I, O, Extra>(
    computation: Computation<I, O>
  ): Computation<[Extra, I], [Extra, O]> =>
    new Computation(input =>
      computation.runF(input[1]).then(output => [input[0], output])
    );

  /**
   * Perform a computation on the first input. Useful in conjunction with
   * branch and pair.
   *
   * ```
   * -> I     -> O
   * -> Extra -> Extra
   * ```
   */
  static first = <I, O, Extra>(
    computation: Computation<I, O>
  ): Computation<[I, Extra], [O, Extra]> =>
    new Computation(input =>
      computation.runF(input[0]).then(output => [output, input[1]])
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
      const result = await computation.runF(input);
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
    computation: Computation<I2, O2>,
    chooser: (input: I | I2) => input is I2
  ): Computation<I | I2, O | O2> =>
    new Computation(async input => {
      if (chooser(input)) {
        const result2 = await computation.runF(input);
        return result2;
      } else {
        const result1 = await this.runF(input);
        return result1;
      }
    });

  /**
   *  Add another computation which yields the same output, creating a new
   *  computation that supports multiple inputs. Takes a function which can
   *  check which computation to use.
   *
   * ```
   * I OR I2 -> O
   * ```
   */
  addInput = <I2>(
    computation: Computation<I2, O>,
    chooser: (input: I | I2) => input is I2
  ): Computation<I | I2, O> =>
    new Computation(input => {
      if (chooser(input)) {
        return computation.runF(input);
      } else {
        return this.runF(input);
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
  private constructor(fun: (input: I) => Promise<O>) {
    this.runF = (input: I) => fun(input);
  }

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

  static make = <I, O>(promiseFunction: (input: I) => Promise<O>) => {
    return new Computation(promiseFunction);
  };

  /**
   * Run the computation, resulting in a Promise<O>. Remember to handle errors!
   */
  run = (input: I): Promise<O> => this.runF(input);
}
