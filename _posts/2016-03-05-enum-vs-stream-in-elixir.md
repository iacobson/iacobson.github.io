---
layout: post
title: Lazy enumerables in Elixir
tags: elixir
excerpt: "A simple case study comparing Enum and Stream modules."
tweet: "Elixir Enum vs Stream. What's the difference?"
---

If you tried [Elixir](http://elixir-lang.org/){:target="_blank"}, you almost certenly ended up playing with collections, such as lists, tuples, maps, etc. For those, Elixir provides the `Enum` module, which offers you access to lots of [useful predefined functions](http://elixir-lang.org/docs/stable/elixir/Enum.html){:target="_blank"} to parse and use the contained information.

However, not as popular as `Enum`, we have it's "lazy brother" `Stream`. Our goal would be to build some really simple examples and test the differences between the two modules.

## Study case 1: parse the full list

Our example will pick the numbers divisible by `17` from a list, we square each result and sum them. That's it! Everything will happen inside the module `ElixirEnumStream`, which I will ignore in the code examples below. 

Let's start with `Enum`:

<div class="file_path">./lib/elixir_enum_stream.ex</div>
```elixir
def testing_enum(x) do
  list = 1..x
  Enum.filter(list, &(rem(&1,17) == 0))
  |> Enum.map(&(&1 * &1))
  |> Enum.sum
end
```

We will run the tests with [ESpec](https://github.com/antonmi/espec){:target="_blank"}, a testing framework inspired by Ruby RSpec.

This is not a by any means a precision test. So, in order to make it relevant, and be able to ignore the fractions of a second, we will pass a large integers list as argument, ranging from `1` to `50_000_000`, which will take several seconds to process.

The result is `2_450_980_465_686_204_411_764`, and the processing time around **9s**. 

Now we will do the same with `Stream`:

<div class="file_path">./lib/elixir_enum_stream.ex</div>
```elixir
def testing_stream(x) do
  list = 1..x
  Stream.filter(list, &(rem(&1,17) == 0))
  |> Stream.map(&(&1 * &1))
  |> Enum.sum
end
```

Of course, the result is the same, and processing time is under **7s**. Good, but not the kind of improvement I was expecting. Why? Just because we used `Stream` not in a wrong way, but not in the best context.

## Study case 2: limit the results in the list

The example context is the same as above, only that we want to limit the sum to the first `10` elements divisible by `17` in our list. 

Again, we start with `Enum`:

<div class="file_path">./lib/elixir_enum_stream.ex</div>
```elixir
deftesting_enum_limited(x) do
  list = 1..x
  Enum.filter(list, &(rem(&1,17) == 0))
  |> Enum.take(10)
  |> Enum.map(&(&1 * &1))
  |> Enum.sum
end
```

The result is `111_265` and processing time around **7s**.

Now the case we were waiting for, `Stream`:


<div class="file_path">./lib/elixir_enum_stream.ex</div>
```elixir
deftesting_stream_limited(x) do
  list = 1..x
  Stream.filter(list, &(rem(&1,17) == 0))
  |> Stream.take(10)
  |> Stream.map(&(&1 * &1))
  |> Enum.sum
end
```

Well, the result is the same, **but** the processing time **0.01s**!!! Oh yes, that looks like a real improvement!

## So, what's the trick?

The good thing is that there's no trick. Let's take a look at the last examples and see what's really happening after each function call. To make it easier, we will use the `1..300` range as example.

First the `Enum`:

```elixir
iex(4)> Enum.filter(1..300, &(rem(&1,17) == 0))
#=> [17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 221, 238, 255, 272, 289]
```

After we run the filter, the actual list with all values divisible by `17` will be created. Only then, `take` will limit it to the first 10 entries, and create a new list with those:

```elixir
iex(5)> Enum.filter(1..300, &(rem(&1,17) == 0))|> Enum.take(10)
#=> [17, 34, 51, 68, 85, 102, 119, 136, 153, 170]
```

And now let's take a closer look at `Stream`:

```elixir
iex(4)> Stream.filter(1..300, &(rem(&1,17) == 0))
#Stream<[enum: 1..300, funs: [#Function<7.16851754/1 in Stream.filter/2>]]>
```

First of all, `Stream` is not actually creating a new list after the function was run, but only a reference to a function which will be applied to each element.

Then, the real improvement comes from the next piece:

```elixir
iex(7)> Stream.filter(1..300, &(rem(&1,17) == 0))|> Stream.take(10)
#Stream<[enum: 1..300,
 funs: [#Function<7.16851754/1 in Stream.filter/2>,
  #Function<35.16851754/1 in Stream.take/2>]]>
```

Not only that `Stream` is not creating intermediary lists, but `take` will not wayt for the `filter` to check all the elements in the list which are divisible by `17`. As soon as it gets the first `10` elements, returns the result:

```elixir
iex(9)> Stream.filter(1..300, &(rem(&1,17) == 0))|> Stream.take(10)|>Enum.to_list
#=> [17, 34, 51, 68, 85, 102, 119, 136, 153, 170]
```

As a conclusion, when you deal with large collections and you do not need to process all the elements, `Stream` will be a real performance booster.

Want to try by yourself? You can find the full code and tests on [github](https://github.com/iacobson/elixir_enum_stream){:target="_blank"}.   

