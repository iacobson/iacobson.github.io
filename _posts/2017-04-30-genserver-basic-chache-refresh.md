---
layout: post
title: "GenServer Basic Caching Refresh"
tags: elixir ecto caching genserver
excerpt: "Part 2 of the previous article. Optimizing the cache refresh"
tweet: "Use GenServer to cache simple BD operations"

---

In the [**previous article**]({% post_url 2017-03-31-cache-repetitive-ecto-queries-with-genserver %}) we created a basic caching system, with the help of a GenServer. We will continue the example, discussing the cache refresh. In the context of the preivous post, the cached **discounts top** would be refreshed when a new product is added in the store. Practically, we run the discounts DB query each time a new product is added. But we were assuming that this operation would not happen too often. The operation is also asynchronous, so no major impact on our shop home page.

## New Context
Let's change a bit the context. We assume our products are created from many external feeds, at a very high rate. Of course it's an hypotetical case, with 20 concurent requests. But hopefully will ilustrate the difference between the implementations. The importance of the cache refresh is increasing. Let's see what is happening with the current state of our system. Again, if you want to check the full code of the demo app, you can find it [on github](https://github.com/iacobson/blog_discounter){:target="_blank"}.

## Add New Products
### v1 - no caching

We are going to measure the 2 existing implementations of the `new_product` function.

<div class="file_path">./lib/shop/web/controllers/product_controller.ex</div>
```elixir
def new_product(conn, %{"version" => "v1"}) do
  with {:ok, %Product{} = product} <- Sales.create_product() do
    conn
    |> put_status(:created)
    |> render("show.json", product: product)
  end
end
```

`Shop.Sales.create_product()` will add a new product to the DB.
<div class="file_path">./lib/shop/sales/sales.ex</div>
```elixir
def create_product() do
  previous = Enum.random(10..1000)
  actual = round(previous * (Enum.random(20 ..90) / 100))
  %Product{}
  |> product_changeset(%{previous: previous, actual: actual})
  |> Repo.insert()
end

defp product_changeset(%Product{} = product, attrs) do
  product
  |> cast(attrs, [:previous, :actual])
  |> validate_required([:previous, :actual])
end

```

The **v1** just creates a product, as the responsibility to calculate the top discouts falls on the `top_discouts v1` function.
<div class="file_path">console</div>
```
▶ siege http://127.0.0.1:4000/api/new_product/v1 -t60s -c20
** SIEGE 4.0.2
** Preparing 20 concurrent users for battle.
The server is now under siege...
Lifting the server siege...
Transactions:		        4033 hits
Availability:		      100.00 %
Elapsed time:		       59.68 secs
Data transferred:	        0.08 MB
Response time:		        0.05 secs
Transaction rate:	       67.58 trans/sec
Throughput:		        0.00 MB/sec
Concurrency:		        3.08
Successful transactions:        4033
Failed transactions:	           0
Longest transaction:	        0.32
Shortest transaction:	        0.01
```

We added **4033** products in a minute, with an average response of **0.05s**.

### v2 - with cache

Now let's see the second version, that must also handle the cache refresh after a new product is added.  

<div class="file_path">./lib/shop/web/controllers/product_controller.ex</div>
```elixir
def new_product(conn, %{"version" => "v2"}) do
  with {:ok, %Product{} = product} <- Sales.create_product() do
    Cache.post_product_v2()
    conn
    |> put_status(:created)
    |> render("show.json", product: product)
  end
end
```
The **new_product v2** triggers a cache refresh after the new product is saved in the database.  

<div class="file_path">./lib/shop/cache/discount.ex</div>
```elixir
# API
  def post_product_v2 do
    GenServer.cast(__MODULE__, :post_product_v2)
  end

# CALLBACKS
def handle_cast(:post_product_v2, _state) do
  {:noreply, Sales.list_products()}
end

```

On each refresh we get the list of **top discounts**. So we can async run the  `post_product_v2`. The access to the cache will not be delayed by the cache update.  

<div class="file_path">console</div>
```
▶ siege http://127.0.0.1:4000/api/new_product/v2 -t60s -c20
** SIEGE 4.0.2
** Preparing 20 concurrent users for battle.
The server is now under siege...
Lifting the server siege...
Transactions:		        3751 hits
Availability:		      100.00 %
Elapsed time:		       59.72 secs
Data transferred:	        0.08 MB
Response time:		        0.06 secs
Transaction rate:	       62.81 trans/sec
Throughput:		        0.00 MB/sec
Concurrency:		        4.04
Successful transactions:        3751
Failed transactions:	           0
Longest transaction:	        0.90
Shortest transaction:	        0.01
```

It's not a huge difference, but there's a catch. If you check the server console, the **top discounts** query continues to run a long time after our one minute test is over. This is due to the fact that the cache refreshing function runs asynchronously. The approach works well as long as there are not multiple products created in the same time.

Under a constant products stream this is clearly not a solution as it will put constant pressure on the database. This proves again how important is to know your system before trying to optimize it.

## Optimizing the Cache Refresh

The goal for this optimization is to reduce the DB pressure and achieve results comparable with the **v1** implementation. One way to achieve this, is not to touch the DB when we refresh the cache. We can simply compare the last discount in the top with the discount of the newly created product.

The implementation of the `new_product` **v3**, is similar to the **v2**, only it calls a different function from the `ShopCache` and pass the new product as argument: `Cache.post_product_v3(product)`


<div class="file_path">./lib/shop/cache/discount.ex</div>
```elixir
# API
def post_product_v3(product) do
  GenServer.call(__MODULE__, {:post_product_v3, product})
end

# CALLBACKS
def handle_call({:post_product_v3, new_product}, _from, state) do
  new_discount = discount(new_product)
  last_discount = List.last(state)[:discount]
  state = new_state(new_discount, last_discount, new_product, state)

  {:reply, state, state}
end

# HELPERS
defp discount(product) do
  discount = (1.0 - (product.actual / product.previous)) * 100
  Float.round(discount, 2)
end

defp new_state(new_discount, last_discount, new_product, state)
  when new_discount > last_discount do

  state
  |> List.delete_at(-1)
  |> List.insert_at(-1, formatted(new_product, new_discount))
  |> Enum.sort(&(&1.discount > &2.discount))
end

defp new_state(_new_discount, _last_discount, _new_product, state), do: state

def formatted(new_product, new_discount) do
  %{
    id: new_product.id,
    previous: new_product.previous,
    actual: new_product.actual,
    discount: new_discount
  }
end
```

If the new product has a higher discount than the last one in the current top, we include it in the top. We remove the last one, and reorder the top.  

This implementation is much more susceptible to race conditions than **v2**. Imagine trying to update the top with 2 high discount products running in parallel processes. Only the last processed will make it in the top. This is why we need to make it synchronous, by using `handle_call`. 

Let's see the results:  

<div class="file_path">console</div>
```
▶ siege http://127.0.0.1:4000/api/new_product/v3 -t60s -c20
** SIEGE 4.0.2
** Preparing 20 concurrent users for battle.
The server is now under siege...
Lifting the server siege...
Transactions:		        4093 hits
Availability:		      100.00 %
Elapsed time:		       59.18 secs
Data transferred:	        0.08 MB
Response time:		        0.04 secs
Transaction rate:	       69.16 trans/sec
Throughput:		        0.00 MB/sec
Concurrency:		        2.74
Successful transactions:        4093
Failed transactions:	           0
Longest transaction:	        0.25
Shortest transaction:	        0.01
```

The results are very similar to the **v1** implementation. This proves that we can create new products and in the same time maintain the **top discounts** updated.  

By combining the **top_discounts v2** from the [**previous article**]({% post_url 2017-03-31-cache-repetitive-ecto-queries-with-genserver %}), with the **new_product v3** we ensure fast responses for both: visiting users and adding new products to the shop.


