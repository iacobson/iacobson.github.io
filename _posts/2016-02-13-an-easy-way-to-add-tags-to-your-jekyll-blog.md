---
layout: post
title: An easy way to add tags to your Github hosted Jekyll blog
tags: ["jekyll", "jquery"]
excerpt: "Using jQuery to manage the Jekyll tag filters may not be the most elegant solution, but is quite easy to implement, and works well."  
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

You will see on the Jekyll documentation and tutorials that you can assign the tags in many ways. I will use the array format with quotes for each tag because, as you will see later, it is possible to use multi word tags `"class variable"` (of course you can use something like `"class-variable"` and make your life easier, but I didn't want to).

It is important to know that now those tags are available in all our site by calling `{%raw%}{{ site.tags }}{%endraw%}`  

## Post layout


