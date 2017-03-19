---
layout: post
title: "Performance Visualization for Elixir apps"
tags: elixir performance visualization
excerpt: "Add a graphical dimension to your performance measurements with charts, flame graphs and plotting."
tweet: "Visualize Elixir apps performance with charts, flame graphs and plotting."

---

In the last article [**The Elixir Bottleneck**]({% post_url 2017-01-29-the-elixir-bottleneck %}) we used some tools to measure and improve the performance of an Elixir application. Now we'll build on top of that. We look for more tools to visually represent the benchmarks and the performance improvements.  

We'll use the previous test application (MagicNumber) as a base. We are going to analyse some of the defined functions such as `get_v2`, `get_v3`. So, please take a look at the previous post to familiarise yourself with those.

## Benchmarking

[**benchee**](https://github.com/PragTob/benchee){:target="_blank"}, the tool we used to benchmark our code, includes some nice plugins. [**benchee_html**](https://github.com/PragTob/benchee_html){:target="_blank"} is the right tool to  visualize the benchmarking results.  

Add the `:benchee_html, "~> 0.1.0"` hex package to your `mix` file. Then configure the benchmark function to output a HTML file with graphs:  

<div class="file_path">./lib/magic_number.ex</div>
```elixir
def benchmark do
  Benchee.run(
    %{
      "get_v2" => fn -> get_v2() end,
      "get_v3" => fn -> get_v3() end,
    },
    time: 20,
    formatters: [
      &Benchee.Formatters.HTML.output/1,
      &Benchee.Formatters.Console.output/1
    ],
    html: [file: "performance/benchmark.html"],
  )
end
```  

You define the formatters to be both console and HTML file and enter a path where the file is created. That's it!

This time we run the benchmark for 20 seconds. We target the `v2` and `v3` implementations of the `get` function. That is the moment when we changed the code to use **async tasks**.

<div class="file_path">console</div>
```
▶ iex -S mix
iex(1)> MagicNumber.benchmark()
```  

You will see that a new **performance** directory in your project, with a **benchmark.html** file inside. Open it and enjoy! So much information available, with such a small extra effort. The report has 2 comparison and 2 individual graphs for each benchmarked function. 

I'm not going to insist too much on the chart types. The package has a [wiki page](https://github.com/PragTob/benchee_html/wiki/Chart-Types){:target="_blank"} which explains very well each of them. It points you even to additional resources.  

Let's analyse some of them in the context of our exercise:  

### Average IPS

![ips](/images/2017-02-18/ips.png "ips"){:style="width: 100%;"}  

Not much to say here. You get a visual representation of iterations per second for each function. The bigger the value of **y-axis**, the better.

### Box Plot

![box](/images/2017-02-18/box.png "box"){:style="width: 100%;"}  

This is a very powerful chart, and I invite you to read more about it if you haven't used it before. You will see the difference between the **average** and **median** values, and the exceptions that influence those results. Aim for a low **y-axis** value, as this represents the time to run.  
By the way, you can hover over the graph and get more details. It's also possible to zoom, export to PNG, and even edit your charts in the cloud. All these thanks to the  plotly.js library.  

### Run Times Histogram  

![run_time](/images/2017-02-18/run_time.png "run_time"){:style="width: 100%;"}  

The last chart we check is the runtimes histogram. This is one of the individual graphs. You will get one for each benchmarked function. We look now at the one for the `get_v3` implementation. It is a representation of the sample size (49 in this case) in time. The sample size is the number of time the function was able to run in the allocated benchmark time (20s for this case). You can see that most occurrences happen in the 0.45s interval. But also you observe one taking up to 0.65s.  

You can now decide if there are any running exceptions that deserve attention or not.  

If benchee_html tools are not enough for your needs take a look also at **benchee_csv** and **benchee_json** packages. You can get the benchmark data in CSV or JSON format and integrate it with other analysis tools.  

## Profiling with Flame Graphs  

Flame Graphs are a form of visualization for profiled functions. You may have already used them for Rails profiling, in Chrome Timeline, or some system tools. I'm not by any means an expert in flame graphs. I must admit, sometimes I find them confusing, but is a good resource, worth mentioning. Especially if you use it together with **exprof** and **fprof**, discussed in the previous post.

I have't found any Elixir tool to generate flame graphs. But there is an Erlang package called [**eflame**](https://github.com/proger/eflame){:target="_blank"}. Add it to your hex file: `:eflame, "~> 1.0"`, then add the profiler in your code:  

<div class="file_path">./lib/magic_number.ex</div>
```elixir
def flamegraph do
  :eflame.apply(MagicNumber, :get_v1, [])
end
```

Run the `flamegraph` function in console. It will generate a file **stacks.out** in the root directory of your project. You need to turn that file into a **.svg** file:  

<div class="file_path">console</div>
```
▶ ./deps/eflame/stack_to_flame.sh < stacks.out > flame.svg

```

Now you can open the new **flame.svg** file in the browser and study it. The process is not that straightforward, but it works.  

**Please note** that for generating the next 3 example flame graphs, I had to tune a bit the MagicNumber app. The `:eflmae` could not deal with those millions of function iterations and be timing out after a while.
So the modifications for the following test are:

MagicNumber: `@list (3..5)` - functions will run only 3 times, so it will be easier for us to identify them on the flame graph  
Constant: `@number 25` - instead of `30`  
Variable: `@interval (1..50_000)` - instead of ``500_000``   

After running the `flamegraph` for `v1`, `v2`, `v3`, and then converting each of the results to svg, you have something like this:  

### `get_v1`
[**download the svg file**](/downloads/2017-02-18/flame-v1.svg){:target="_blank"}

![flame-v1](/images/2017-02-18/flame-v1.png "flame-v1"){:style="width: 100%;"}  

You can see the 3 big sections, for each calculation of both the **constant** and **variable**. `Constant.fibonacci` runs for each of them. When you open the SVG file in the browser, you can hover each block to get details. Also, clicking on blocks, will "zoom in" to that block view.

### `get_v2`
[**download the svg file**](/downloads/2017-02-18/flame-v2.svg){:target="_blank"} 

![flame-v2](/images/2017-02-18/flame-v2.png "flame-v2"){:style="width: 100%;"}  

This time the constant is calculated only once and proceeds with finding the 3 variables.  

### `get_v3`
[**download the svg file**](/downloads/2017-02-18/flame-v3.svg){:target="_blank"} 

![flame-v3](/images/2017-02-18/flame-v3.png "flame-v3"){:style="width: 100%;"}  

Somehow similar to `v2`, but the variables are calculated in individual processes.

## Tunning `Task.async_stream` Performance with Plots  

In the [previous article]({% post_url 2017-01-29-the-elixir-bottleneck %}), **Solution #3** chapter, we discussed about `Task.async_stream/5`. It's the Elixir 1.4 way to handle a specific number of parallel processes, by defining the `max_concurency` option.  

At that time we used a random number of 50 parallel processes, but this time we want to fine tune this number. Too many processes and the system will be overloaded. Too few, and you will not take full advantage of Elixir concurrency.  

After some search on the subject, I've found [this great article about measuring and visualizing GenStage performance](http://teamon.eu/2016/measuring-visualizing-genstage-flow-with-gnuplot/){:target="_blank"}. We do not discuss GenStage, but we can apply the same approach and tools. So the code below, as well as use of **gnuplot** is heavily inspired by that article.  

More to the point, we want to optimize this function:  

`@list |> Task.async_stream(Variable, :calculate, [constant], timeout: :infinity, max_concurrency: 50)`  

Here we calculate in parallel some numbers with the function `:calculate` from `Variable` module. To determine an optimal level of concurrency we need to check the inputs and the outputs of the `Variable.calculate` function.  

We will start by building the monitoring tool, which is, in fact, a `GenServer`:  

<div class="file_path">./lib/monitor.ex</div>
```elixir
defmodule Monitor do
  use GenServer

  # API

  def start_link() do
    GenServer.start_link(__MODULE__, [:input, :output], name: __MODULE__)
  end

  def update(action) do
    GenServer.cast(__MODULE__, {:update, action})
  end

  def stop do
    GenServer.stop(__MODULE__)
  end

  # CALLBACKS

  def init(actions) do
    time = get_time()
    {files, counter} = initialize(actions, { %{}, %{} })

    {:ok, {time, files, counter}}
  end

  def handle_cast({:update, action}, {time, files, counter}) do
    count = counter[action] + 1
    action_time = get_time() - time
    write_to_file(files[action], action_time, count)

    {:noreply, {time, files, %{counter | action => count}}}
  end

  # HELPERS

  defp initialize([], result) do
    result
  end

  defp initialize([action | actions], {files, counter}) do
    file = File.open!("monitor-#{action}.log", [:write])
    write_to_file(file, 0, 0)

    files = Map.put(files, action, file)
    counter = Map.put(counter, action, 0)

    initialize(actions, {files, counter})
  end

  defp get_time do
    :os.system_time(:millisecond)
  end

  defp write_to_file(file, time, count) do
    IO.write(file, "#{time}\t#{count}\n")
  end
end

```

### Init  

We start the server with the `[:input, :output]` arguments. Use those to create two log files in the initializer. One is for the start of the function (input). The other is for the end (output).  
The logs will store pairs of **time** (in milliseconds) from the start and **count** how many times the function was run. We assign a starting value of **time = 0** and **count = 0** to each log file. The current time, the generated log files and a counter for inputs and outputs are passed as server state.  

### Update  

The update action takes `:input` or `:output` as arguments. It increases the count for the specific action with **1**, writes the new **time** and **count** in the log file, and updates the server state.  

Now add the monitoring service to the targeted function:  

<div class="file_path">./lib/monitor.ex</div>
```elixir
def calculate(var, constant) do
  Monitor.update(:input)
  result = .....
  Monitor.update(:output)
  result
end
```

The **input** is going at the beginning of the function, while the **output** just before the return. In the main `MagicNumber` module we create a new monitor function:  

<div class="file_path">./lib/monitor.ex</div>
```elixir
@list (1..2_500) 
# modify the list to a higher value 2500
# this will be the total number of times Variable.calculate is called

def monitor do
  Monitor.start_link()
  get_v4()
  Monitor.stop()
end
```

Run the `monitor` function and you get 2 new files in the project root: **monitor-input.log** and **monitor-output.log**. You can get valuable information just by checking those files but would be much easier to visualize them in a graphical format.  

### gnuplot  

**gnuplot** will plot a graph from the generated logs. First, you need to install the package. It's as simple as `brew install gnuplot` for OSX. Then you create a **.gp** file, based on which gnuplot knows how to read and interpret the logs.  

<div class="file_path">./plot.gp</div>
```bash
set terminal png font "Arial,14" size 1400,1000
set output "monitor.png"

set title "Variable Calculation"
set xlabel "Time (ms)"
set ylabel "Variables processed"
set key top left

set xrange [0:60000]

# plot series (see below for explanation)
# plot [file] with [line type] ls [line style id] [title ...  | notitle]

plot  "monitor-input.log"     with lines   ls 1 title "Input",\
      "monitor-output.log"    with lines   ls 2 title "Output"
```

The code is not difficult to understand. On the x-axis is the time and on the y-axis is the count (the number of times the function was run). It is important to set the `xrange` which will limit the time axis to 60 seconds in our case. This will make the comparison between many graphs easier. In the end, we pass the 2 log files to plot.  

You generate the **monitor.png** graph by calling:  

<div class="file_path">console</div>
```
▶ gnuplot plot.gp
```

#### get_v3  
Change the `monitor` function above to call the `get_v3()` function first. The v3 uses `Task.for async` instead of `Task.async_stream`. That means it will try to run all passed functions in parallel. In this case, 2_500 of them.  

![get_v3](/images/2017-02-18/monitor-v3.png "get_v3"){:style="width: 100%;"}  

See how `Task.async` is not optimal for such a long list of expensive functions. The `calculate` function returns all values only after the whole list is processed. During this time the system is overloaded and slow.

#### get_v4 with  `max_concurrency: 1000`  
Back to `get_v4` monitoring. We try a maximum concurrency of 1000.  
![get_v4_1000](/images/2017-02-18/monitor-v4-1000.png "get_v4_1000"){:style="width: 100%;"}  

Much better. The function returns values as it is called. Still, we aim for parallel lines between the input and the output.  

#### get_v4 with  `max_concurrency: 120`  
By testing with different concurrency values, I ended up with 120.  
![get_v4_120](/images/2017-02-18/monitor-v4-120.png "get_v4_120"){:style="width: 100%;"}  
This is quite what I was expecting. It looks like a good balance between the input and the output of the function. This will also not overload the system.  

Yet, as mentioned in the previous article, those values are specific to each system and configuration. Trying this on your computer may create a different graph.  
This is why visualization is so powerful. You can experiment with different settings, run the benchmarks, check the graphs, and optimise according to your needs.
