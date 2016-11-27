---
layout: post
title: "Model View Channel ?! with Phoenix"
tags: phoenix
excerpt: "A ToDo test aplication in Elixir Phoenix without controllers ... well, almost without controllers."
tweet: "A ToDo test aplication in Elixir Phoenix using channels and no controllers."

---

A while ago, contributing to [the Formerer project](https://github.com/efexen/formerer){:target="_blank"}, I had my first contact with Phoenix Channels. I enjoyed it so much and thought why not to build an app that uses only Channels instead of Controllers?  

This is how ChanDoThis experiment was born. Yes, just another todo list application... but a live updating one :) .The app is live on Heroku, and available [here.](https://chandothis.herokuapp.com/){:target="_blank"}  

Just to clarify, this post is not a tutorial or step by step guide on how to build a controller-less application in Phoenix. I will focus more on the code organization and the relation between front-end and back-end of the app.  

### Specifications

Before starting to code I defined the minimal structure and functionalities:  

- a simple Todo list, with 2 models: List and Todo  
- make use of Phoenix Channels instead of Controllers  
- no front-end frameworks and no AJAX calls
- one-page app
- everything live updates for all users present on the app  
- follow as close as possible the CRUD actions from a "normal" Controller  

### Structure

#### Phoenix Controller and Template

Let's start with the only controller that exists in the app. It's the `PageController` with a single `index` action. This generates the default Phoenix welcome page.  

The page template includes also the fixed structure of lists and todos. It also has some data attributes such as:  

`data-list="new-list-container"`, `data-list="list-index-container"` or `data-todo="todos-container"`

Those containers will be soon used to render dynamic lists and todos.  

#### JavaScript  

The JS side will take the role of Views and Templates.  

```bash
web/static/js/
  app.js
  sockets.js
  views/
    list.js
    todo.js
  actions/
    list_actions.js
    todo_actions.js
  templates/
    list/ (hbs templates)
    todo/ (hbs templates)
```

**app.js** imports List from the views and initialize it with the socket `List.init(socket)`

The view connects to the socket and creates the channel. Views have 2 roles:  

- receive channel messages or user input  

- send it to the action JS file  

For example, this is how you create a list:  

<div class="file_path">./web/static/js/views/list.js</div>
```javascript

// user clicks the `create-list` button and calls createListPush
// from the actions file
$(document).on('click', '[data-behaviour="create-list"]',
  () => ListActions.createListPush(channel))

// the view receives the message from the channel with event "create" 
// calls the createListReceive with the response argument
channel.on('create', resp => {
  ListActions.createListReceive(resp)
})

```  

The JS actions files together with the Channels will stand in place of the classic Controller. To avoid writing HTML in the JS, I use handlebars templates (`.hbs`). The role of the JS actions files is:  

- push the event to the channel  
- render errors if any  
- render handlebar template for the specific action  

Coming back to the above example, this is how the action JS file handles the creation of a new list:  

<div class="file_path">./web/static/js/actions/list_actions.js</div>
```javascript
// get the name of the new list from the form
// push the event "create" to the channel
// render any errors

createListPush(channel){
  let name = $('[data-list="new-list-name"]').val()
  channel.push("create", {name: name}).receive("error", error => {
    $(`[data-error="error-${error.attr}"]`).remove()
    $('[data-list="new-list-container"]').append(errorTemplate(error))
  })
},

// on response clear the new list form
// renders the newListTemplate with response as argument

createListReceive(resp){
  $('[data-list="new-list-container"]').empty()
  $('[data-list="list-index-container"]').prepend(newListTemplate(resp))
},

```

The `newListTemplate` is actually imported hbs template:  
`import newListTemplate from "../templates/list/new_list.hbs"`  
The CRUD actions are organized in Push / Receive pairs.

### Channels

Channels use pattern matching to map the events sent by the front-end. This reflects the same CRUD actions as the JS above.  

<div class="file_path">./web/channels/list_channel.ex</div>
```elixir
def handle_in(topic = "create", params, socket) do
  # DRY the code with handle_action function
  # there is a separate ListActions module handling all DB interactions

  handle_action(topic, create_list(params), socket)
end

defp handle_action(topic, action, socket) do
  case action do
    {:ok, list} ->
      # if the list is persisted
      # broadcast the event "create" and list JSON
      broadcast!(socket, topic, list_to_json(list))
      {:reply, :ok, socket}
    {:error, changeset} ->
      # else reply with error
    {:reply, {:error, parse_changeset_errors(changeset)}, socket}
  end
end
```  

A Phoenix view renders the list JSON:  

<div class="file_path">./web/views/list_view.ex</div>
```elixir
def render("list.json", %{list: list}) do
  %{
    id: list.id,
    name: list.name
  }
end
```

There are other components we did not review, such as models or lib modules, but those are not relevant in the context of this case study.  

However, the full code is available on Github:  
[https://github.com/iacobson/chan_do_this/blob/lists-todos-final](https://github.com/iacobson/chan_do_this/blob/lists-todos-final){:target="_blank"} if you want to take a closer look.  

To finish with the structure, below is a diagram of the system components and the interactions between them:



```bash
+-------------+        +-------------+                  +-------------+
|             | input  |             |  action function |             |
| USER        +--------> JS VIEWS    +------------------> JS ACTIONS  |
|             |        |             |   push / receive |             |
+-------------+        +-^-----------+                  +--^-------+--+
                         |                                 |       |
                         |                                 |       |
                         |             push action         |       |
                   action|       +-------------------------+       |
                 response|       |     receive error               |
                         |       |                           render|
                         |       |                                 |
                         |       |                                 |
+-------------+        +-+-------v---+                  +----------v--+
|             |persist |             |                  |             |
| DB          <--------+ CHANNELS    |                  |HBS TEMPLATES|
|             |        |             |                  |             |
+-------------+        +-------------+                  +-------------+
```


### Test-drive the app  

As mentioned in the beginning of this post, the app is hosted on Heroku: [https://chandothis.herokuapp.com/](https://chandothis.herokuapp.com/){:target="_blank"}

You will need 2 browser windows opened in split screen. Or, even better, open the app at the same time on 2 different devices.  

Create a new list. The list should instantly appear in the other browser/device.  

Create new todos, edit their names, delete or complete them. Everything should reflect at the same time in all the instances of the app.  


### Conclusion

This is a simple, straightforward project, but I think it achieved its goal. There are ways to (almost) avoid controllers in Phoenix. Channels can take their place while keeping a CRUD-like structure.  

This is not something you would want to do for all your projects. But whenever you need many live updates on the page, it may be an option.  

While it was so fun to work on this app, it wasn't entirely what I expected when I started it. I expected a cool Elixir / Channels learning project and ended up mostly with a JS / jQuery one.  Hunting Lists and Todos IDs around in the view proved  at times to be frustrating and repetitive.  

### What's next?

With all the good and bad parts, this can be a very good learning project. There are many things that you can build and test on top of it such as:  

- add more clarity to the JS side and remove duplications  
- add some form of Router  
- implement a controler-less user authentication system  
- use Phoenix Presence to show online users  
and so much more.  

Just [clone the project](https://github.com/iacobson/chan_do_this){:target="_blank"} and have fun!
