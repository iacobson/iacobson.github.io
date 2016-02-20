---
layout: post
title: An easy way to add tags to your Github hosted Jekyll blog
tags: ["jekyll", "jquery"]
excerpt: "Using jQuery to manage the Jekyll tag filters may not be the most elegant solution, but is quite easy to implement, and works well."
tweet: "Add tags to Jekyll, the easy way."  
---

Have you tried to add tags to your Jekyll powered static blog? Probably you saw there is no easy, out of the box solution to make it work (or at least I did not found one). Before we proceed, I need to make 3 remarks:  

- by "make it work" I mean you should be able not only to display the tags on the post, but be able to click on any of them and get the complete list of the posts marked with this tag.    
- I've not considered any Jekyll [plugin](https://help.github.com/articles/using-jekyll-plugins-with-github-pages/){:target="_blank"} that is not compatible with Github hosting, so there may be some simple solution if you don't host your blog on Github.  
- I'm using [semantic ui](http://semantic-ui.com/){:target="_blank"}, not bootstrap as css framework, as you will see in some html classes in the code examples below.  

Now that we've clarified the context, let's proceed with the implementation:

## General idea

The main idea is to filter the on page static generated content with the help of jQuery. In order to do this, we need to have some kind of indication of the tag that we want to display. We will achieve this by passing the tag in the url, as optional parameter (e.g. `http://iacobson.net/index?tag=ruby`). With jQuery we parse the current url and then filter the posts list to display just the posts that have this specific tag.  
The tools we need are jQuery (which will need to be included in your site) and liquid template filters (liquid is the templating language used by Jekyll).

## Post

In the post header we will specify the post tags:  

<div class="file_path">./_posts/2016-02-13-my-post.md</div>
```html
---
layout: post
title: My title
tags: ["ruby", "class variable"]
---
```  

You will see on the Jekyll documentation and tutorials that you can assign the tags to posts in many ways. I will use the array format with quotes for each tag because, as you will see later, it is possible to use multi word tags `"class variable"` (of course you can use something like `"class-variable"` and make your life easier, but I didn't want to).

It is important to know that now those tags are available in all our site by calling `{%raw%}{{ site.tags }}{%endraw%}`  

## Post layout

<div class="file_path">./_layouts/post.html</div>
```html
{%raw%}
{% for tag in page.tags %}
  <a class="ui tiny label post-tag"
	href="{{ site.baseurl }}/index?tag={{ tag | replace: " ", "-" }}">
	{{ tag }}
    <div class="detail"> {{ site.tags[tag].size }} </div>
  </a>
{% endfor %}
{%endraw%}
```

We iterate over the post tags (current page) and each label have a link to the base url (e.g. **iacobson.net**) followed by the **index** page and the optional param **tag** and its value.   
We use the `| replace: " ", "-"` filter to handle the multi word tags. They will still be displayed on the label as multi word, but in the url the spaces will be replaced with dashes (e.g. one of your tags can be "class variable").  You can find more about liquid filters [here](https://docs.shopify.com/themes/liquid-documentation/filters){:target="_blank"}.  
As you probably guessed, if you want to add the total number of posts that are labeled with the respective tag you can use `site.tags[tag].size`.

## Index page

On the home page (index.html) I want to be able to see all the tags for all the posts.  

**label tags list:**
<div class="file_path">./index.html</div>
```html
{%raw%}
{% for tag in site.tags %}
  <a class="ui tiny label post-tag {{ tag[0] | replace: " ", "-" }}"
    href="{{ site.baseurl }}/index?tag={{ tag[0] | replace: " ", "-" }}">
    {{ tag[0] }}
    <div class="detail"> {{ tag[1].size }} </div>
  </a>
{% endfor %}
{%endraw%}
```

The code resembles the one above, with a few exceptions:
- we iterate over the site posts
- we assign the tag name as label class, so we can add some active tag css later on
- the site tags are in array format. To get the name you select the first element `[0]`, to get the full list of posts for this specific tag, you select the second element of the array `[1]`.  

Maybe the most ambiguous step is to add the tags as classes to the articles list, so they can be found and filtered by jQuery. And this is complicated just because we are stubborn and insist to have that multi word tags option.

**articles list:**  
<div class="file_path">./index.html</div>
```html
{%raw%}
{% for post in site.posts %}
	{% capture tags %}

	{% for tag in post.tags%}
	  {{ tag | replace: " ", "-"}}
	{% endfor %}

	{% endcapture %}

	<article class="post {{ tags | truncatewords: post.tags.size | replace: '...', ''}}">
	<!-- article details here -->
	</article>
{% endfor %}
{%endraw%}
```

For each post, we use `capture` to assign a list of the post tags to the `tags` variable. You can read more about assigning variables in liquid templates [here](https://docs.shopify.com/themes/liquid-documentation/tags/variable-tags){:target="_blank"}.   
The capture will not return a nice list of tags so, before adding the defined variable to the article class, we truncate it to the number of tags of each post. As per the liquid documentation for `truncatewords` filter, *"An ellipsis (...) is appended to the truncated string"*, so we need to get rid of them with the `replace`.

*If you have any idea about how to simplify this step, I strongly advise you to write it in the comments section.*

And with this, we finished the html and liquid part. Now is time for jQuery.

## jQuery

We want our jQuery to do a couple of things:
- filter the posts list to display only the ones corresponding to the selected tab
- identify the selected tab label and change its css, so we will know which one is active

Also, do not forget to include the js file in the **index.html**

The explanations are included as comments in the code below:  
<div class="file_path">./js/tag-filters.js</div>
```javascript
$( document ).ready(function() {
  // call the tag related functions only if tag is present and tag is not "all"
  if(tag !== undefined && tag !== "all"){
    // color selected tags
    $('.post-tag-selected').toggleClass('post-tag-selected');
    $('.label.' + tag).addClass('post-tag-selected');
    // filter articles by tag
    $('article').each(function(){
        $(this).hide();
    });
    $('article').each(function(){
      if ( tagPresent(tag, this) ){
        $(this).show();
      }
    });
  }
});

// get the tag from url
var tag = document.location.search.split("=")[1];

// check if tag in the url is present in the article class
var tagPresent = function(param_tag, article){
  if ($.inArray(param_tag, $(article).attr('class').split(' ')) > -1){
    return true;
  }
};
```

That's it. Now you can enjoy the new functionality of your blog that will allow you to better organize your posts with tags.

You can see the full code in my blog [Github repository](https://github.com/iacobson/iacobson.github.io).

## Bonus

If you have some other ideas that will involve running liquid templating code in javascript you can do so by including this at the top of your **.js** file:  

```html
---
---
```

Now all liquid filters, tags, etc. are available in your javascript.
