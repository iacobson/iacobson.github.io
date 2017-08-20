---
layout: post
title: "Testing GenServer Basic Cache"
tags: elixir ecto caching genserver
excerpt: "Part 3 of the basic caching series. Explore different options to test the basic caching service."
tweet: "Explore different options to test the basic caching service."

---

[**Part 1 - Cache repetitive Ecto Queries with GenServer**]({% post_url 2017-03-31-cache-repetitive-ecto-queries-with-genserver %})  
[**Part 2 - GenServer basic caching refresh**]({% post_url 2017-04-30-genserver-basic-chache-refresh %})  
**Part 3 - Testing GenServer basic cache**  


In part 1 and 2 we explored ways to use GenServer as a basic caching tool for repetitive Ecto queries. This time we will cover another aspect: testing. 

If you followed the other articles in the series, the code is quite simple. So you may think that there is nothing special to consider for the tests. And you would be almost right. **Almost!**

There are some aspects not strictly related our caching subject. But more to GenServer (processes) and Ecto, which worth covering.

Let's start by writing a few simple tests for our caching service:

<div class="file_path">./test/cache/cache_test.exs</div>
```elixir
defmodule Shop.CacheTest do
  use Shop.DataCase
  alias Shop.Cache
  alias Shop.Sales.ProductFactory

  setup do
    for actual <- (700 .. 730) do
      ProductFactory.insert(:product, previous: 900, actual: actual)
    end

    :ok
  end

  test "can get top discounts" do
    top = Cache.get_products_v2()

    assert Enum.count(top) == 10
    assert List.first(top).actual == 700
    assert List.last(top).actual == 709
  end

  test "can insert new products" do
    product = ProductFactory.insert(:product, previous: 900, actual: 600)
    Cache.post_product_v3(product)

    top = Cache.get_products_v2()
    assert Enum.count(top) == 10
    assert Enum.at(top, 0).actual == 600
    assert Enum.at(top, 1).actual == 700
  end
end
```

In the `setup` I'm using [ExMachina](https://github.com/thoughtbot/ex_machina){:target="_blank"} to generate products with different levels of discounts. Then checking if the top has 10 products and the actual price of the first and last products in the top. The second tests ensure that a new product with high discount will be in the discounts top.  

At this point we expect those simple tests to pass without any issues. But they are not!

<div class="file_path">console</div>

```
Assertion with == failed
code:  Enum.count(top) == 10
left:  0
right: 10
```

The failed test shows no products in the top. Using `IEx.pry` or `IO.inspect` in the **Cache implementation**, we can see that, actually, there are no products at all (eg. `Repo.all(Product)`). Run the same commands in the test file, and you will see that the products are there! So, what is happening?

## The Issue

Well, the answer lies in the [`Ecto.Adapters.SQL.Sandbox`](https://hexdocs.pm/ecto/Ecto.Adapters.SQL.Sandbox.html#content){:target="_blank"} module. This is the way the tests handle Ecto. Take some time and read the documentation. At least the first paragraph for now.  
After checking the docs, asking stackoverflow and experimenting with the code, I found out who is the one "guilty" for our test failure. It's the `init/1` function in the Cache implementation.  

<div class="file_path">./lib/shop/cache/cache.ex</div>
```elixir
def init(:ok) do
  {:ok, Sales.list_products()}
end
```

### Why?

Because it contains a function that calls `Shop.Repo`.

### So what?

The Cache GenServer process is started in the main application supervision tree. That means that `Shop.Repo` is called before the **test_helper.exs** is able to run  
`Ecto.Adapters.SQL.Sandbox.mode(Shop.Repo, :manual)`  
and take control over the DB connections. The Cache GenServer has a separate DB connection than our tests.

## Solution 1 - restart the Cache GenServer
If you do not want to change any code in the current Cache implementation, the solution is to restart the GenServer in the setup of the test:

<div class="file_path">./test/cache/cache_test.exs</div>
```elixir
.....
use Shop.DataCase # make sure is NOT async: true
.....

setup do
.....
  Supervisor.terminate_child(Shop.Supervisor, Cache)
  Supervisor.restart_child(Shop.Supervisor, Cache)
.....
end
```

We kill the initial process and start a new one. This time the test is aware of the new connection. The **data_case.ex** runs in shared mode. It allows the test process to share its connection with the new Cache process. However, the tests should **NOT** be run with `async` option.  

<div class="file_path">./test/data_case.ex</div>
```elixir
unless tags[:async] do
  Ecto.Adapters.SQL.Sandbox.mode(Shop.Repo, {:shared, self()})
end
```

Run the tests again, and they will pass.

This setup may be acceptable if you need to test only this module. But let's assume the following: the Cache module is used in many other parts of the app, which we want to test as well. If you follow the same logic, you will need to restart the Cache server for each test and run it without `async`. Well, that may not be acceptable anymore, especially for a big test suite.

### Mock the Cache

At this point, we already tested the Cache. We know that it works. We do not need the same implementation in every new test, but we need the same results. For this, we can revert to our initial, pre-cache logic from the first article in this series. Meaning we will use SQL queries to get the top discounts.

Create a MockCache module:  

<div class="file_path">./lib/shop/mock/mock_cache.ex</div>
```elixir
defmodule Shop.MockCache do
  alias Shop.Sales

  def get_products_v2 do
    Sales.list_products()
  end

  def post_product_v2 do
    Sales.list_products()
  end

  def post_product_v3(_product) do
    Sales.list_products()
  end
end
```

We use the config files to pick the Cache module for each environment. MockCache for `test` and Cache for everything else:  

<div class="file_path">./config/config.exs</div>
```elixir
.....
config :shop, :cache, Shop.Cache
.....
```

<div class="file_path">./config/test.exs</div>
```elixir
.....
config :shop, :cache, Shop.MockCache
.....
```

Now you can use the env variables wherever you need the Cache. For example in the ProductController:

<div class="file_path">./lib/shop/web/controllers/product_controller.ex</div>
```elixir
.....
@cache Application.get_env(:shop, :cache)

def top_discounts(conn, %{"version" => "v2"}) do
  products = @cache.get_products_v2()
  .....
end

def new_product(conn, %{"version" => "v2"}) do
  .....
  @cache.post_product_v2()
  ......
end

def new_product(conn, %{"version" => "v3"}) do
  ......
  @cache.post_product_v3(product)
  ......
end
```

The new tests that will call the Cache will now use the MockCache. You will not need to restart the GenServer and also you will be able to run them `async`.  

## Solution 2 - change the `init` function

Another possibility is to avoid the issue itself by changing the `init` implementation. We don't call Repo in the GenServer `init`. **test_helper** will take control of the connections. The changes are not big, nor complicated:  

<div class="file_path">./lib/shop/cache/cache.ex</div>
```elixir
.....

def init(:ok) do
  {:ok, :empty}
end

def handle_call(:get_products_v2, _from, :empty) do
  products = Sales.list_products()
  {:reply, products, products}
end

def handle_call(:get_products_v2, _from, state) do
  {:reply, state, state}
end

def handle_call({:post_product_v3, new_product}, from, :empty) do
  products = Sales.list_products()
  handle_call({:post_product_v3, new_product}, from, products)
end

def handle_call({:post_product_v3, new_product}, _from, state) do
  new_discount = discount(new_product)
  last_discount = List.last(state)[:discount]
  state = new_state(new_discount, last_discount, new_product, state)

  {:reply, state, state}
end

.....
```

We initialize the server with an `:empty` state, which will be easy to pattern match. The first time the `get_products_v2` is called, it will populate the state with the current top discounts.  

The same happens if you will create a new product and call `:post_product_v3`. If the state is `:empty`, it will populate it with the current discounts when calling the initial implementation of the function.

You can now delete the cache restart functions from your test, and the test will pass:
```elixir
  Supervisor.terminate_child(Shop.Supervisor, Cache)
  Supervisor.restart_child(Shop.Supervisor, Cache)
```

I like this approach because it eliminates the testing issue, and touches the DB only when need it. On the other hand, changing your implementation to accommodate the test suite may not be your preferred option.

Anyway, if you decide to go for it, the cache mocking above, applies for this case as well.

### Bonus - run the cache test async

Let's push it a bit further and try to run the Cache tests with the `async` option. Yes, they will fail with something like: `(DBConnection.OwnershipError) cannot find ownership process for #PID<0.310.0>`. If you read the rest of the error, it will hint you the solution as well. You can manually allow the process to use the same connection as the parent(test process):  

<div class="file_path">./test/cache/cache_test.exs</div>
```elixir
.....

use Shop.DataCase, async: true

setup do
  pid = Process.whereis(Cache)
  Ecto.Adapters.SQL.Sandbox.allow(Repo, self(), pid)
  :ok
end
.....

```

Now the Cache tests will be able to run in `async` mode as well.

The code in this final version is available [on github](https://github.com/iacobson/blog_discounter){:target="_blank"}.
