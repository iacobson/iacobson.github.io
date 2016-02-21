---
layout: post
title: Keep your Rails controllers and models skinny with services
tags: rails
excerpt: "Services are a great way to keep your business logic organized into specialized classes, which are easy to find, modify and reutilize."
tweet: "Services are a great way to keep your business logic organized into specialized classes."
---

Even if you started to learn Ruby on Rails quite recently, you've probably already heard about this concept: "fat model, skinny controller". If you didn't, this basically says that there should be no business logic inside the controllers, and this should live inside the model.  
This is a good and organized approach until a point. If you have some seriously complicated models the code inside them may become really hard to read and understand over time.  
A good practice in such case would be to use another concept: "skinny model, skinny controller". But then you would ask, where would the business logic live? And you would be right.

## What are the services? 
The concept of "services" can be found under many different names, in tutorials, books or blog posts. Don't be intimidated by any of those names. The main idea is that services, or whatever they are called, **are just normal Ruby classes** that will help you organize your business logic.  

It is your decision to organize the services folders structure, depending on your project size and complexity. Services are also a great place to store logic related to external API integrations.

For this exercise, we will use as example the application in the previous blog post about [the models polymorphic associations]({% post_url 2015-12-5-use-polymorphic-associations-to-organize-your-rails-models %}). Reorganizing the models, left behind some cluttered controllers with a lot of responsibilities  that are just not in the right place (even if the application works). It is not very important to understand the application, as we will study just some isolated controller actions.

Remember, this is not about making the application work, but about making your code clean, readable and DRY.

## Refactoring the Products controller index action
Our test application is a very basic shopping cart simulation. It has a list of products that can be managed by an admin, and also can be added to the cart by an user. Currently our Products controller index looks like this:

<div class="file_path">.app/controllers/products_controller.rb</div>
```ruby
  def index
    # display products depending on the category. Category is sent as param
    @categories = Product.pluck(:category_type).uniq.sort

    if params[:category] && @categories.include?(params[:category])
      @products = Product.where(category_type: params[:category]).includes(:category) # avoids n+1 issue
    else
      @products = Product.where(category_type: @categories[0]).includes(:category)
    end

    # find or create the current active order for the user
    @order ||= current_user.orders.find_by(status: "active")
    if @order == nil
      @order = current_user.orders.create(status: "active")
    end
  end
```

Well, it doesn't look quite right. Our controllers knows too many things:  

- how to find the product categories based on the passed params
- to filter the products based on the category
- also to retrieve or create orders

It is a serious amount of logic, living in the wrong place.  

Ok, what can we do about it? The first thing (and easiest) can be to move it in the Product model. But I feel like things will still not be clear enough. The Product model handling orders and categories ... doesn't sound very logical.

Looks like it's the right time to write our first **service**. We need to think about some logic linking the products, categories and orders. It is important that for our service to have a meaningful name. In our case I think that all three notions above are linked with our shopping cart functionality, so we will create a "shopping cart" service.

Inside our **app** folder create a new one called **services** . There we will create a new file **shopping_cart_service.rb** where we will host the logic related to the products and orders.

<div class="file_path">.app/services/shopping_cart_service.rb</div>
```ruby
class ShoppingCartService
  attr_reader :user, :params

  def initialize(user:, params:)
    @user = user
    @params = params
  end

  def product_categories
    @categories ||= Product.pluck(:category_type).uniq.sort
  end

  def products_by_category
    if params[:category] && product_categories.include?(params[:category])
      product_find(params[:category])
    else
      product_find(product_categories.first)
    end
  end

  def current_order
    @order ||= user.orders.where(status: "active").first_or_create
  end

  private

  def product_find(category)
    Product.where(category_type: category).includes(:category)
  end
end
```

The logic is very similar to the one we had in the index method. We just pass our user and params as arguments in the initializer, and also export the product finder in a private method, to keep our code DRY.

*Rails server must be restarted at this point to include the newly created file.*

And finally, our Products controller index action will be slim and pretty:

<div class="file_path">.app/controllers/products_controller.rb</div>
```ruby
#...
def index
  @shopping_cart = ShoppingCartService.new(user: current_user, params: params)
end
#...
```

We just instantiate the newly created service class, and we can retrieve the products, categories and orders in the view, as follows:
<div class="file_path">.app/views/products/index.html.erb</div>
```html
<% @shopping_cart.product_categories %>
<% @shopping_cart.products_by_category %>
<% @shopping_cart.current_order %>
```  

