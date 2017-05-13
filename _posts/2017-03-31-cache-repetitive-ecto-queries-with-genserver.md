---
layout: post
title: "Basic Caching of Repetitive Ecto Queries with GenServer"
tags: elixir ecto caching genserver
excerpt: "Take advantage of GenServer state to cache some simple but expensive DB operations."
tweet: "Use GenServer to cache simple BD operations"

---

Caching is a complicated subject, and can add a lot of complexity to any application development. But, as per the title of the article, we are going to build a very simple kind of caching. We will focus on repetitive operations that have a high impact on the DB and take advantage of GenServer.  
Can we store those queries as a GenServer state? Is it faster than the normal DB query? Let's find out!

## Context

The example app is an online shop. More precise, a very small functionality that handles the products discounts. Let's assume we have a homepage. It is identical for all our shop users. It will display the top 10 of our products, ordered by discount percentage. We do not care about the front-end part, but only about the backend API. A JSON response will be enough.  

Another assumption is that our shop has lots of visitors, and a moderate rate of adding new products. We will see why this is an important factor to consider.

### Why does this example qualify for a simple caching implementation?

- the **top discounts** is the same for all users. That means we have exactly the same query executed over and over again on each page visit.  
- race conditions are not a major problem. Even if you add a new product that changes the top, the order of the operations is not critical. The new product will be there on the next visit.  
- high traffic means a lot of requests for the discounts. Those do not change the data, instead just query it. Adding products will be the only operation that will trigger a cache refresh. We decided above that we have a moderate rate of adding new products. Think about an opposite example. We receive lots of data from many sources, but the number of visitors is very low. Caching top products query after each update would not make any sense. It would probably make our system slower in the end.  

As a first conclusion, you need to know very well your system and user behaviour. Only then you can decide to cache any DB operations, even if you find them repetitive.

## Initial application

The shop will be a simple Phoenix app. To make things more interesting we'll be using [the new version: 1.3, rc.0](https://elixirforum.com/t/phoenix-v1-3-0-rc-0-released/3947){:target="_blank"} at the time I'm writing this.

Phoenix uses a new generator: `phx`  


<div class="file_path">console</div>
```
▶ mix phx.new shop
```

**The article will not include every single line of code in the app, but you can [check the full version on github](https://github.com/iacobson/blog_discounter){:target="_blank"}**  

The excellend Phoenix json generator will create all the boilerplate code we need:  

<div class="file_path">console</div>
```
▶ mix phx.gen.json Sales Product products previous:integer actual:integer
```

If you are not familiar with Phoenix 1.3, please follow the link above and read about the new structure. Otherwise, you may not find some things in the place you expect them to be.

For the purpose of our test, we seed the DB with 5000 products with random prices.

<div class="file_path">./priv/repo/seeds.exs</div>
```elixir
(1 .. 5000)
|> Enum.each(fn(_x) ->

    previous = Enum.random(10..1000)
    actual = round(previous * (Enum.random(20 ..90) / 100))
    Shop.Repo.insert!(
      %Shop.Sales.Product{
        previous: previous,
        actual: actual
      }
    )
  end)
```
For easy tracking, we change the default controller functions to `top_discounts` and `new_product`. Those are the only 2 actions available in the app. For benchmarking simplicity both are `get` requests. The new product prices are random generated.  

<div class="file_path">./lib/shop/web/controllers/product_controller.ex</div>
```elixir
def top_discounts(conn, %{"version" => "v1"}) do
  products = Sales.list_products()
  render(conn, "index.json", products: products)
end

def new_product(conn, %{"version" => "v1"}) do
  with {:ok, %Product{} = product} <- Sales.create_product() do
    conn
    |> put_status(:created)
    |> render("show.json", product: product)
  end
  end
```

Change the router to accept `:version` as param. We will use this to benchmark different implementation versions for the same function.  

<div class="file_path">./lib/shop/web/router.ex</div>
```elixir
scope "/api", Shop.Web do
  pipe_through :api
  get "/top_discounts/:version", ProductController, :top_discounts
  get "/new_product/:version", ProductController, :new_product
end
```

The **v1** is the default implementation. We query the DB for top 10 discounts, every time a user is accessing the page. `Shop.Sales.list_products()` will query the discounts.   

<div class="file_path">./lib/shop/sales/sales.ex</div>
```elixir
def list_products do
  top_discounts_query()
  |> Repo.all()
end

defp top_discounts_query do
  from product in Product,
    select: %{
      id: product.id,
      previous: product.previous,
      actual: product.actual,
      discount: fragment("ROUND((1 - (1.0 * ?) / ?) * 100, 2) as discount", product.actual, product.previous)},
    order_by: [desc: fragment("discount")], limit: 10
end
```

With that, we are ready for the first benchmark. My tool of choice for this example is [Siege](https://www.joedog.org/siege-manual/){:target="_blank"}. It's an HTTP testing and benchmarking utility. It allows us to measure our system under heavy stress. It is really easy to install, use and interpret the results, at least for our very simple test case.

## Benchmarking Top Discounts

We start by benchmarking the top discounts. We want our shop users to have a smooth experience, and the home page to load as fast as possible.  

First, we reset the database and repopulate it with the seeds. Please note that even not mentioned, I will repeat this step before every benchmark that requires creating new products.  

<div class="file_path">console</div>
```
▶ mix ecto.reset
▶ mix run priv/repo/seeds.exs
```

Then we run the siege with the following options. We'll keep those identical for all future benchmarks:  
- first we pass in the URL we want to benchmark: in this case `http://127.0.0.1:4000/api/top_discounts/v1`. This points to the first version of the implementation of our `top_discounts`  
- `-t60s` - the test will run for 60 seconds  
- `-c100` - is the number of concurrent simulated users  

<div class="file_path">console</div>
```
▶ siege http://127.0.0.1:4000/api/top_discounts/v1 -t60s -c100

Transactions:		        2677 hits
Availability:		      100.00 %
Elapsed time:		       59.16 secs
Data transferred:	        1.49 MB
Response time:		        1.92 secs
Transaction rate:	       45.25 trans/sec
Throughput:		        0.03 MB/sec
Concurrency:		       87.05
Successful transactions:        2677
Failed transactions:	           0
Longest transaction:	        2.46
Shortest transaction:	        0.15
```

We are mostly interested in the number of successful transactions **2,677** and the average response time **1.92s**. The response time looks quite high when the system is under stress. It's time to improve it.

### Implementing the Cache

As said before, this is an extremely simple version of cache. It's designed to handle only this kind of particular repetitive task. We do not go into complex subjects as cache key expiration. The **top discounts** cache will refresh each time we add a new product. For that we will implement `v2` version of our controller function: `top_discounts`:  

<div class="file_path">./lib/shop/web/controllers/product_controller.ex</div>
```elixir
alias Shop.Cache

def top_discounts(conn, %{"version" => "v2"}) do
  products = Cache.get_products_v2()
  render(conn, "index.json", products: products)
end
```

The **top_discount v2** gets the top discounts from the Cache (which we will detail next).  

The **Cache** itself is just the state of a basic GenServer implementation:  

<div class="file_path">./lib/shop/cache/discount.ex</div>
```elixir
defmodule Shop.Cache do
  use GenServer
  alias Shop.Sales

  # API

  def start_link do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  def get_products_v2 do
    GenServer.call(__MODULE__, :get_products_v2)
  end

  # CALLBACKS

  def init(:ok) do
    {:ok, Sales.list_products()}
  end

  def handle_call(:get_products_v2, _from, state) do
    {:reply, state, state}
  end

end
```

When the GenServer starts, the `init` function sets the server state to the current **top discounts**. This is done by calling `Sales.list_products()`, the same function used in **top_discounts v1**. But there is a catch. In the **v1** it runs every time a user access the home page. Now it is called only once, when the GenServer starts, and then again when new products are added. For **top_discounts v2**, the user request will not hit the database, but the GenServer state.  

Remember to add Cache server to the Phoenix supervision tree:  

<div class="file_path">./lib/shop/application.ex</div>
```elixir
.....
  worker(Shop.Cache, [])
.....
```

We can now test the new implementation:
v class="file_path">console</div>
```
▶ siege http://127.0.0.1:4000/api/top_discounts/v2 -t60s -c100
Transactions:		       17434 hits
Availability:		      100.00 %
Elapsed time:		       59.54 secs
Data transferred:	        9.71 MB
Response time:		        0.09 secs
Transaction rate:	      292.81 trans/sec
Throughput:		        0.16 MB/sec
Concurrency:		       25.73
Successful transactions:       17434
Failed transactions:	           0
Longest transaction:	        0.56
Shortest transaction:	        0.02
```

### Conclusion

Let's analyse the results:  

**top_discounts**:  

| Metric            | v1            | v2            | Improvement                 |
|-------------------|--------------:|--------------:|-----------------------------|
| Transactions      | 2,677         | 17,434        |  6.51x more transactions    |
| Response Time     | 1.92          | 0.09          | 21.33x faster response time |
  

The results are impressive, way over my expectations. Under heavy load, the cached version is a lot faster than the initial query based implementation. It is a huge improvement that requires little effort. However, you will need to decide when this kind of implementation makes sense. If you think that some of your system components will go out of sync because of the async cache setter, this simple caching may not be right for your app.  

But if you find yourself running the same query over and over again, you can try to use this GenServer caching implementation.

Don't forget to measure the results.

In the article [**next article**]({% post_url 2017-04-30-genserver-basic-chache-refresh %}), we will continue this example. We'll be adding new products and refresh the cache.
