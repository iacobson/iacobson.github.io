---
---

$( document ).ready(function() {
  // posts close button padding
  $('.close-button')
    .sticky({
      offset: 20,
      context: '#post-content'
    });

  // posts close button hover effects
  $('.close-button').hover(function(){
    $('.close-button .icon').removeClass('close-icon').addClass('close-icon-hover');
  }, function(){
    $('.close-button .icon').removeClass('close-icon-hover').addClass('close-icon');
  });
  $('.home-sidebar')
    .sticky({
      context: '.posts',
      pushing: true,
      offset: 200,
      bottomOffset : 100
    });

  // hide mobile design on desktop
  hideMobileDesign();

  $( window ).resize(function() {
    hideMobileDesign();
  });

});


var hideMobileDesign = function(){
  if ($('.desktop-design').is(':visible')) {
    $('.mobile-design').hide();
  }
  else {
    $('.mobile-design').show();
  }
};
