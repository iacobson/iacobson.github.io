---
layout: post
title: "The Elixir Bottleneck"
tags: elixir performance benchmark profiling
excerpt: "Benchmarking and profiling Elixir apps. Measure, identify and fix potential bottlenecks."
tweet: "Measure, identify and fix potential bottlenecks in your Elixir app."

---
I've been following for a while Nate Berkopec's [Guide to Rails Performance](https://www.railsspeed.com/){:target="_blank"}. It's a great resource to learn about measuring and optimising your Rails apps speed.  
We're not going to discuss Rails performance. But one of the first things that Nate emphasis in his book applies to any language or framework: 

> _do not start optimising your app until the metrics tell you so._  


That should be no exception for Elixir.  

## What is the goal?  

This post explores Elixir tools you can use to measure the performance of the app, discover issues and help you take the right decisions. 

## Context  

Our demo app is called MagicNumber, and yes, it calculates a ... number, based on some inputs. 

<div class="file_path">terminal</div>
```bash
mix new magic_number
```  

The main idea of the MagicNumber is to run a series of computation heavy functions. This will allow us to measure and see a clear outcome for the code optimisations.  

The magic number is obtained from a constant and some variables. As you will see, the functions in the `Constant` and `Variable` modules are not very elegant or optimised. They will just generate the load on the system. Let's assume those are some kind or external service that we cannot influence.  We will not modify constant and variable functions in our exercise.  

**The main  `MagicNumber` module will be our single only focus. We'll try to identify the bottlenecks and fix them.**  

### The Constant
The constant is calculated as the n-th Fibonacci number. As said above, I choose this implementation just to add a heavy load on the system:

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

As the result exponentially grows, so does the execution time. So can we say this function is good enough for our test? Not really! Not until you measure it. You know it's kind of slow for numbers over 30, but what slow means?  

Introducing our first tool:  

#### Benchee ([github](https://github.com/PragTob/benchee){:target="_blank"} and [hexdocs](https://hexdocs.pm/benchee/Benchee.html#statistics/1){:target="_blank"})

Benchee is a benchmark tool for Elixir code. The hex package is well maintained and updated, easy to install and use. Add it to your mix file and run the `mix deps.get`. In our `Constant` module above, we add the following:  

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

We benchmark the function `calculate/1` with default `@number` value 30. The `time: 10` option is the actual time our code runs. Then in your console call the newly created `benchmark` function:  

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

The output is simple and intuitive. We have the **ips** (iterations per second), meaning how many times our function runs in one second. But at this point, we are more interested in the **average** execution time of the function (47.83ms). That is a very valuable information for the rest of our experiment.  
You can find detailed info about the other available metrics and options in the documentation. For now, this is all we need.  

### The Variable

The Variable `calculate/2` function will take a number and the above constant as arguments. Then it checks for some divisors and returns an average. As decided above, this code is not very important, as we are not going to change it. It just adds some more relevant processing time to our test case. Here is the code:  

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

Again, you should know how much time averages an iteration of the above `calculate/2` function. I will add the Benchee code for the `Variable` module:  

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

Then run the benchmark with the following arguments:  
- a random number (5)  
- the previously known result of our `Constant.calculate` (832040):  

<div class="file_path">console</div>
```bash
▶ iex -S mix
iex(1)> MagicNumber.Variable.benchmark(5, 832040)

Name                ips        average  deviation         median
calculate         18.69       53.51 ms    ±11.12%       52.22 ms
```
The variable calculation will take an average of 53.51ms.

### The MagicNumber  

Finally, the `MagicNumber` module. This is where we are going to concentrate all our attention from now on.  

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

> _If you already observed something very wrong with this code, you are right! (see below)_   

It takes a list of integers from 1 to 10. Maps it passing each of them as arguments to the `Variable.calculate/2` together with the constant. Then the results are summed. And that's it. This is our **magic number**. I called the main function `get_v1` in anticipation to the chapter below.  

## Finding the bottleneck   

Armed with the knowledge gained above, I can roughly estimate the average execution time of finding the magic number. For the `get_v1` implementation, it should be around 10 * ( 0.05s + 0.05s ) = 1s.  

Let's use Benchee to see if the assumption is correct. I add the `benchmark` function exactly as in the other modules, and run it:  

<div class="file_path">console</div>
```bash
▶ iex -S mix
iex(1)> MagicNumber.benchmark()

Name             ips        average  deviation         median
get_v1          0.92         1.08 s     ±1.30%         1.08 s
```  

Our estimation was "almost" correct. The average run time for `get_v1` is 1.08s. That is unacceptable for our app! The magic number should be calculated faster. At this point, you cannot rely anymore on the benchmarks. They showed us there is a speed issue, but won't point you to the potential problem in the code.  
It's time to find a **profiler**.

### ExProf ([github](https://github.com/parroty/exprof){:target="_blank"}) and `mix profile.fprof` ([hexdocs](https://hexdocs.pm/mix/Mix.Tasks.Profile.Fprof.html#content){:target="_blank"})

Both of them use Erlang tools: [:eprof](http://erlang.org/doc/man/eprof.html){:target="_blank"}, respectively [:fprof](http://erlang.org/doc/man/fprof.html){:target="_blank"}.  
A profiler will trace the execution of all functions in the code, and report the time consumed with each. So it is the perfect tool to identify bottlenecks in the application.  

Sounds too good to be true? You are right again! Both profilers (at least in our application case) are far from being perfect. The added time to the `get_v1` function execution is huge. The code that runs normally in 1 second, takes more than 1 minute to ExProf and more than 5 minutes to `mix profile.fprof`. This is due to the huge number of iterations in our example. Only the `fibonacci/1` function runs 26,925,370 times! The profiler needs to record it each time. The Mix documentation warns us about those risks.  

> _If you want to try the examples below make sure you reduce the `@number` in the `Constant`, or be very very patient._  

As a consequence, the reported execution times are completely wrong compared to what is happening in reality. The good thing is that it doesn't matter that much. We can take those times as simple units of measure, to identify the potential bottlenecks. Let's see how it works.  

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

And run the profiler (I've deleted the Elixir functions to save space):  
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

As we know that the Time is not relevant in our case, we will look at the calls and %. **Calls** tells you the number of time each function is called. **%** is the percent of time spent with each function, from the total execution time.

### Investigation #1

At this point, you have the tools to look for the problems in the code. The first candidate would be the `fibonacci/1` function. It runs 26,925,370 times and 62% of the total application run time. In the context chapter, we decided to treat everything outside the `MagicNumber` module as some sort of external dependency. So we cannot change functions in the `Constant` module.   
The next logical question is: who calls this function? And the answer is `Constant.calculate/1`, which runs ... 10 times ?! This is called directly from our main module. We clearly found something!  

For a very small application such as `MagicNumber` it's easy to spot this kind of errors. When you have complex applications, that will call helpers or services, it is not that easy to find bottlenecks without a profiler.  

Finding where the issue comes from just with ExProf is not that simple. This is why we can complete our investigation with the help of `mix profile.fprof`. The printed results are quite long, so I will look for the `fibonacci` function we identified above:

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

As you will find in the documentation, the `--callers` option will print info about the callers and called functions. The sign `<--` is pointing you to the analysed function. What I really miss here is a percentage indicator. Yet you can see that the 10 `calculate/1` calls consume more than half of the whole application run time. The main advantage of `:frpof` is that we can see the functions in a context.  
Eg. on its own, the `Constant.calculate/1` takes 94s, but considering the called functions inside, will take 327s (speaking of seconds in the context of the profiler)

Next question: why do we need to call 10 times a function that will return a calculated constant? More than this, if you look in the code, the `calculate/1` is called from the main module with no arguments (with the default argument). As long as there are no external dependencies, the function should return the same result each time.

### Solution #1

The solution for this case is really simple. This is closer to fixing a mistake than optimising the code. We assign the `Constant.calculate/1` to a variable that we then use in the `map`. We will implement a new function called `get_v2`, and you will soon see the benefits of doing so.

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
As you can see, the `Constant.calculate/1` runs only once and the `fibonacci/1` takes 13% of total time, instead of 62%. But this doesn't tell much about the actual application performance improvement. Back to Benchee which has a very cool comparison tool. You change the benchmark implementation to include both versions of the `get` function. And now you can see why I choose to keep both functions and "tag" them with the version:  

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

The new `get` functions need 569ms to complete, compared to 998ms of the old one, which is 1.75x slower.

Good, but not good enough! 

### Investigation #2

Analysing the profilers above, you can see the `Variable.calculate/2` is also called 10 times. But if you try to apply the same solution as above, it certainly won't work. Checking the function you will see it is called each time with a different argument. You may also observe that each iteration is isolated. It doesn't depend on the previous function result to execute. This may be a very good sign for Elixir parallel processing capabilities.   

### Solution #2

Let's use the `Task.async/3` function to spawn a new process for each `Variable.calculate/2` iteration:   

<div class="file_path">./lib/magic_number.ex</div>
```elixir
def get_v3 do
  constant = Constant.calculate()
  @list
  |> Enum.map(&Task.async(Variable, :calculate, [&1, constant]))
  |> Enum.map(&Task.await(&1, :infinity))
  |> Enum.reduce(0, &(&1 + &2))
end
```

Then call `Task.await/2` to return the function replies.

### Measuring Results #2

Running the benchmark for `get_v2` and `get_v3`, we can see the impact of the new code:  


<div class="file_path">console</div>
```bash
Name             ips        average  deviation         median
get_v3          2.86      350.26 ms     ±3.60%      347.24 ms
get_v2          1.67      600.31 ms     ±3.59%      596.17 ms

Comparison:
get_v3          2.86
get_v2          1.67 - 1.71x slower
```

The new function is able to run 2.86 iterations per second, compared to 1.68 of the v2. Maybe you observed the benchmark for v2 in example #1 was different (1.76 ips). I will come back to that in the Conclusions section below.

### Investigation #3  

#### or, when the solution becomes the new problem  

I will say from the start that this section is not strictly related to performance measuring. Yet, it has to do with a different kind of bottleneck than the ones identified above.  

Until now, we tested our Magic Number application with a list of numbers from 1 to 10. Well, what happens to the `get_v3` function, if we switch to a list with 1,000 elements instead of 10? I will update the code in the MagicNumber module with `@list (1..1_000)`.   

We will use the Erlang `:observer` to get some extra info. You can start it in the iex with `:observer.start`. Looking in the System tab, in Statistics, you will see a running queue with a 0 (zero) value. If you run the `get_v3` function, the running processes will soon become something like 992. Our parallel processing function will spawn a new process for all the numbers in the list. All those processes run expensive functions, with a lot of computations. 

Now imagine that 1,000 becomes 1,000,000 and your system will freeze for a very long time.  

### Solution #3

In such cases, you may want to limit the number of spawned parallel processes. Thanks to some of the new functions introduced in Elixir 1.4, this becomes very easy. And I'm speaking about `Task.async_stream/5`. This function has an option `:max_concurrency` that handles ... (guess what?) the maximum concurrency. You can read more about it in the [documentation](https://hexdocs.pm/elixir/Task.html#async_stream/5){:target="_blank"}  

<div class="file_path">./lib/magic_number.ex</div>
```elixir
def get_v4 do
  constant = Constant.calculate()
  @list
  |> Task.async_stream(Variable, :calculate, [constant], timeout: :infinity, max_concurrency: 50)
  |> Stream.map(fn({:ok, result}) -> result end)
  |> Enum.to_list()
  |> Enum.reduce(0, &(&1 + &2))
end
```

For this example, I put 50 as the maximum parallel processes spawned. Finding the optimal maximum value for both application and system is out of the scope of this article. But I will come back to this in a future post.  

## Conclusions

We are reaching the end of our experiment. Let's review some of the conclusions:

- use combinations of **benchmarks** and **profiling** to measure, identify and improve the code in your application  
- benchmarking results are heavily dependent on the system configuration on which they run. The processor, memory, OS, running applications will be very different from user to user. More important, they won't be the same as your production host configuration. Do not expect the same identical results on local system and production or staging.  
- profiling becomes unreliable from the time measure point of view when we deal with many repetitive functions. Yet, it will output a correct image on the percentage of time spent per function.  
- you can find and correct programming errors with profiling (see example #1 above).  
- take advantage of Elixir parallel processing capabilities. But be careful about the number of running concurrent processes.  
- keep an eye on the  `:observer`  

You can find the code for the example above in this [github repository](https://github.com/iacobson/blog_elixir_bottleneck){:target="_blank"}
