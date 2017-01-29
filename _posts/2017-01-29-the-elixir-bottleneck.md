---
layout: post
title: "The Elixir Bottleneck"
tags: elixir, performance, benchmark, profiling
excerpt: "Benchmarking and profiling Elixir apps. Measure, identify and fix potential bottlenecks."
tweet: "Measure, identify and fix potential bottlenecks in your Elixir app."

---

In the last month I've been following Nate Berkopec [Guide to Rails Performance](https://www.railsspeed.com/){:target="_blank"}. It is a great resource about measuring and optimising your Rails apps speed.  
We are not going to discuss about Rails performance, but one of the first things that Nate emphasis in his book applies to any language or framework: do not start to optimise your app until the metrics tell you so.  
That hould be no exception for Elixir. And introducing a bottleneck in your application is easier than we think. Event if it's just because of a small mistake, or not using the right tools for the job, the consequences will be visible on your app.

## What is the goal?
The goal is to discover and explore Elixir tools you can use to measure the performance of the app and help you take the right decisions. The focus will be mainly on using those tools, rather than the bottleneck issues themselves (which will be just trivial examples).

## Context
Our demo app will be called MagicNumber, and yes, it calculates a ... number, based on some conditions.  

<div class="file_path">terminal</div>
```bash
mix new magic_number
```  

The only idea of the MagicNumber is to have a series of computation heavy functions which will allow us to do easy measuring and see a clear output for the optimisations.

The MagicNumber will be obtained from a `Constant` and more `Variable`s that depend on the Constant. As you will see, the functions in the `Constant` and `Variable` modules are not very elegant or optimised. Those will just generate the load on the system, and we will not modify them in our exercise. Let's assume those are some kind or external service that we cannot influence.  
**So our only focus for finding the bottlenecks and optimising the app will be the main `MagicNumber` module.**

### The Constant
The constant will be calculated as the n-th Fibonacci number. As said above, I choose this implementation just to add a heavy load on the system:  

<div class="file_path">./lib/constant.ex</div>
```elixir
defmodule MagicNumber.Constant do
  @number 30

  def calculate(number \\ @number) do
    fibonacci(number)
  end

  defp fibonacci(0), do: 0
  defp fibonacci(1), do: 1
  defp fibonacci(n), do: fibonacci(n - 1) + fibonacci(n - 2)
end
```  

We can try it in the console:  
<div class="file_path">console</div>
```bash
iex(1)> MagicNumber.Constant.calculate(20)
6765
iex(2)> MagicNumber.Constant.calculate(30)
832040
iex(3)> MagicNumber.Constant.calculate(40)
102334155
```  

As the result exponentially grows, so does the execution time. So can we safely say that this function is good enough for our test? Not really. Not until you measure it. You know it's kind of slow for arguments orver 30, but what slow means?

Introducing our first tool:

#### Benchee ([github](https://github.com/PragTob/benchee){:target="_blank"} and [hexdocs](https://hexdocs.pm/benchee/Benchee.html#statistics/1){:target="_blank"})

Benchee is a benchmark tool for elixir code. The hex package is well maintained and updated, esasy to install and utilise. After you add it to your mix file and run the `mix deps.get` is ready for usage. In our `Constant` module above, we add the following:  


<div class="file_path">./lib/constant.ex</div>
```elixir
def benchmark do
  Benchee.run(
    %{
      "calculate" => fn -> calculate() end
    }, time: 10
  )
end
```  

We benchmark the function `calculate/1` with its default `@number` value as argument, which is 30. The `time: 10` option is the actual time for which our code is benchmarked. Then in your console call the newly created `benchmark` function:  

<div class="file_path">console</div>
```bash
▶ iex -S mix
iex(1)> MagicNumber.Constant.benchmark()
Elixir 1.4.0
Benchmark suite executing with the following configuration:
warmup: 2.0s
time: 10.0s
parallel: 1
inputs: none specified
Estimated total run time: 12.0s

Benchmarking calculate...

Name                ips        average  deviation         median
calculate         20.91       47.83 ms     ±4.88%       47.54 ms

```  

The output is simple and intuitive. We have the **ips** (iterations per second), meaning how many times our function run in one second. But at this point we are mostly interested about he **average** execution time of the function (47.83ms). That is a very valuable information for the remaining of our experiment.

In the documentation, you can find detailed info and examples about the other metrics and options you can pass to the benchmark. For now is all we need.


### The Variable
The Variable `calculate/2` function will take a number and the above constant as arguments, check for some divisors, and returning an average. As decided above, this code is not very important, as we are not going to change it. It just needs to add some more relevant processing time to our test case. Here is the code:  

<div class="file_path">./lib/variable.ex</div>
```elixir
defmodule MagicNumber.Variable do
  @interval (1..500_000)

  def calculate(var, constant) do
    @interval
    |> Enum.filter(&(rem(&1, var) == 0))
    |> constant_divisors(constant)
    |> average_restult()
  end

  defp constant_divisors([], _constant), do: []

  defp constant_divisors(list, constant) do
    list
    |> Enum.filter(&(rem(constant, &1) == 0))
  end

  defp average_restult([]), do: 0

  defp average_restult(list) do
    result = Enum.sum(list) / Enum.count(list)
    Float.round(result)
  end
end
```  

Again, to be able to better understand the bottleneck abalysys, you should know how much time averages a iteration of the above `calculate/2` function. I will add the Benchee code for the `Variable` module:  

<div class="file_path">./lib/variable.ex</div>
```elixir
def benchmark(var, constant) do
  Benchee.run(
    %{
      "calculate" => fn -> calculate(var, constant) end
    }, time: 10
  )
end
```  

Then run the benchmark with a random number (5), and the previously known result of our `Constant.calculate` (832040):  

<div class="file_path">console</div>
```bash
▶ iex -S mix
iex(1)> MagicNumber.Variable.benchmark(5, 832040)

Name                ips        average  deviation         median
calculate         18.69       53.51 ms    ±11.12%       52.22 ms
```
The variable calculation will take an average of 53.51ms.

### The MagicNumber
Finally, the `MagicNumber` module, the one where we are going to concentrate all our attention from now on.  


<div class="file_path">./lib/magic_number.ex</div>
```elixir
defmodule MagicNumber do
  alias MagicNumber.Constant
  alias MagicNumber.Variable
  @list (1..10)

  def get_v1 do
    @list
    |> Enum.map(&(Variable.calculate(&1, Constant.calculate())))
    |> Enum.reduce(0, &(&1 + &2))
  end
end
```  

> _if you already observed something very wrong with this code, you are right! (see below)_  

It takes a list of integers from 1 to 10, maps it and pass each of them as arguments to the `Variable.calculate/2` togheter with the constant. Then the results are summed. Ant that's it. This is our **magic number**. I called the main function `get_v1` in anticipation to the chapter below.

## Finding the bottleneck  
Armed with the knowledge gained above, I can roughly estimate the average execution time of finding the magic number. For the get_v1 implementation should be around 10 * ( 0.05s + 0.05s ) = 1s.  

Let's use Benchee to see if the assumption is correct. I add the `benchmark` function exactly as in the other modules, and run it:  

<div class="file_path">console</div>
```bash
▶ iex -S mix
iex(1)> MagicNumber.benchmark()

Name             ips        average  deviation         median
get_v1          0.92         1.08 s     ±1.30%         1.08 s
```  
Our estimation was "almost" correct. The average run time of our main function that returns the magic number is 1.08s. We decide that this is unacceptable for our app. The magic number should be calculated faster. At this point we cannot relay anymore on the benchmarks. They showed us the existence of a speed issue, but won't point you to the potential problem in the code.  
It's time to find a profiler.

### ExProf ([github](https://github.com/parroty/exprof){:target="_blank"}) and `mix profile.fprof` ([hexdocs](https://hexdocs.pm/mix/Mix.Tasks.Profile.Fprof.html#content){:target="_blank"})

Both of them use Erlang tools: (`:eprof`)[http://erlang.org/doc/man/eprof.html]{:target="_blank"}, respectively (`:fprof`)[http://erlang.org/doc/man/fprof.html]{:target="_blank"}.  
A profiler will actually trace the execution of all functions in the code, and report how much time is consumed for each. This ability makes them the perfect tool to identify bottlenecks in the application.  

Sounds too good to be true? You are right again! Both profilers, at least in our application case are far from being perfect. The added time to the execution time of the `get_v1/0` function is huge. Practically the code that runs normally in 1 second, takes more than 1 minute to ExProf and more than 5 minutes to `mix profile.fprof`. This is maily due to the huge number of iterations in our example. Only the `fibonacci/1` funtion runs 26,925,370 times and the profiler needs to record it each time. Even the Mix documentation warns us about those risks.  

> If you want to try the examples below make sure you reduce the `@number` in the Constant, or be very very pacient.  

As a consequence, the reported execution times are completly eronated compared to what is happening in reality. The good thing, is that it does not matter too much. We can take those times as simple units of measure, in order to identify the potential bottlenecks. Let's see how it works.

Follow the installation instructions for ExProf. Then in our MagicNumber module:  

<div class="file_path">./lib/magic_number.ex</div>
```elixir
import ExProf.Macro

# create a profiler
  def profiler do
    profile do
      get_v1()
    end
  end
```  

And run the profiler (I've deleted the Elixir functions entries from the results below in order to save space):  
<div class="file_path">console</div>
```bash
▶ iex -S mix
MagicNumber.profiler()

FUNCTION                                                          CALLS        %      TIME  [uS / CALLS]
--------                                                          -----  -------      ----  [----------]
erlang:send/2                                                         1     0.00         0  [      0.00]
'Elixir.MagicNumber':get_v1/0                                         1     0.00         4  [      4.00]
'Elixir.MagicNumber.Variable':average_restult/1                      10     0.00        15  [      1.50]
'Elixir.MagicNumber.Constant':calculate/1                            10     0.00        19  [      1.90]
'Elixir.MagicNumber.Variable':calculate/2                            10     0.00        25  [      2.50]
'Elixir.MagicNumber':'-get_v1/0-fun-0-'/1                            10     0.00        26  [      2.60]
'Elixir.MagicNumber.Constant':calculate/0                            10     0.00        31  [      3.10]
'Elixir.MagicNumber.Variable':constant_divisors/2                    10     0.00        36  [      3.60]
'Elixir.MagicNumber.Variable':'-constant_divisors/2-fun-0-'/2   1464482     3.29   3217229  [      2.20]
'Elixir.MagicNumber.Variable':'-calculate/2-fun-0-'/2           5000000    11.55  11296793  [      2.26]
'Elixir.MagicNumber.Constant':fibonacci/1                      26925370    62.67  61303381  [      2.28]
-------------------------------------------------------------  --------  -------  --------  [----------]
Total:                                                         46320081  100.00%  97818807  [      2.11]
```

As we know that the Time is not really relevant in our case, we will look at the calls and %. **Calls** is the number of time each function is called. **%** is the percent of time spent with each function, from the total execution time.

### Investigation #1

At this point we have the tools to look for the problems in our code. The first candidate would be the `fibonacci/1` function. It runs 26,925,370 times and 62% of the total application run time. However we decided in the context chapter, that we treat everything outside the main `MagicNumber` main module as some sort of external dependency, and we cannot change it.  
The next logical question then is: who calls this function? And the answer is `Constant.calculate/1`, which runs ... 10 times ?! As this is called directly from our main module, we clearly found something!  

For a very small application such as magic_number it's easy to spot this kind of errors. But when you have complex applications, that will call helpers or services in order to get a result it is not that easy to find bottlenecks without a profiler.  

Even just with ExProf, finding where the issue comes from is not that simple. This is why we can complete our investigation with the help of `mix profile.fprof`. The printed results are quite long, so I will look for the `fibonacci` function we identified above:

<div class="file_path">console</div>
```bash
▶ mix profile.fprof --callers -e MagicNumber.get_v1

                                                                   CNT    ACC (ms)    OWN (ms)
Total                                                         46347568  517696.511  507939.845
.....

MagicNumber.Constant.calculate/1                                    10  327081.492   94371.692
MagicNumber.Constant.fibonacci/1                              26925360       0.000  226162.850
  MagicNumber.Constant.fibonacci/1                            26925370  327081.492  320534.542  <--
    :suspend                                                     14875    6508.050       0.000
    :garbage_collect                                              1343      38.900      38.900
    MagicNumber.Constant.fibonacci/1                          26925360       0.000  226162.850
.....
```  

As you will find in the documentation, the `--callers` option will print info about the callers and called functions. The sign `<--` is pointing you to the analyzed function. What I really miss here is a percentage indicator. However you can see that the 10 `calculate/1` calls consume more than half of the whole application run time. The main advantage of `:frpof` is that we can see the functions in a context. Eg. on its own, the `Constant.calculate/1` takes 94s, but considering the called functions inside, will take 327s (speaking of seconds in context of profiler, in the absence of %)

Next question: why do we need to call 10 times a function that we said will return a calculated constant? More than this, if you look in the code, the `calculate/1` is called from the main module with no arguments (with the defaut argument). So as long as there are no external dependencies, the function should return the same result each time.

### Solution #1

The solution for this case is really really simple. This is closer to fixing a mistake than optimizing the code. We assign the `Constant.calculate/1` to a variable that we then use in the `map`. We will implement a new function called `get_v2`, and you will soon see the benefits in doing so.

<div class="file_path">./lib/magic_number.ex</div>
```elixir
def get_v2 do
  constant = Constant.calculate()
  @list
  |> Enum.map(&(Variable.calculate(&1, constant)))
  |> Enum.reduce(0, &(&1 + &2))
end
```

### Measuring Results #1
Run again the ExProf on the new function:

<div class="file_path">console</div>
```bash
'Elixir.MagicNumber.Constant':calculate/1                             1     0.00         4  [      4.00]
'Elixir.MagicNumber.Variable':'-constant_divisors/2-fun-0-'/2   1464482     7.69   3193375  [      2.18]
'Elixir.MagicNumber.Constant':fibonacci/1                       2692537    13.75   5709236  [      2.12]
'Elixir.MagicNumber.Variable':'-calculate/2-fun-0-'/2           5000000    26.62  11050162  [      2.21]
-------------------------------------------------------------  --------  -------  --------  [----------]
Total:                                                         22087230  100.00%  41517227  [      1.88]
```

As you can see, the `Constant.calculate/1` runs only once and the `fibonacci/1` takes 13% of total time, instead of 62%. But this doesn't really tell much about the actual application perofrmance improvement. So, back to Benchee which has a very cool comparison tool. You basically just change the benchmark implementaion to include both versions of the `get` function. And now you can see why I choose to keep both funcitons and "tag" them with the version:

<div class="file_path">./lib/magic_number.ex</div>
```elixir
def benchmark do
  Benchee.run(
    %{
      "get_v1" => fn -> get_v1() end,
      "get_v2" => fn -> get_v2() end
    }, time: 10
  )
end
```

Running the new benchmark will show us the real improvement, in a really nice way:  

<div class="file_path">console</div>
```bash
iex(1)> MagicNumber.benchmark()
Name             ips        average  deviation         median
get_v2          1.76      568.91 ms     ±1.74%      569.53 ms
get_v1          1.00      998.02 ms     ±1.17%      999.37 ms

Comparison:
get_v2          1.76
get_v1          1.00 - 1.75x slower
```  

The new `get` functions needs 569ms to complete, compared to 998ms of the old one, which is 1.75x slower.

Good, but not good enough! 

### Investigation #2
Analyzing the profilers above, you can see that also the `Variable.calculate/2` is called 10 time, but if you want to apply the same solution as above, it certainly won't work.


### Solution #2

### Measuring Results #2
