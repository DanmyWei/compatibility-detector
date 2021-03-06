/**
 * Copyright 2010 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Check whether the page uses the non-standard scrollTop and
 * scrollLeft properties.
 * @bug https://code.google.com/p/compatibility-detector/issues/detail?id=16
 *
 * http://w3help.org/zh-cn/causes/BX9008
 * The scrollTop and scrollLeft properties are not included in any public
 * standard, and have different behavior in different browsers.
 * In IE and Firefox, document.body.scrollTop/Left work in quirks mode but not
 * in standards mode, while document.documentElement.scrollTop/Left work
 * in standards mode but not quirks mode.
 * In Webkit, only document.body.scrollTop/Left work, both in quirks mode and
 * standars mode. And document.documentElement.scrollTop/Left always return 0,
 * according to https://bugs.webkit.org/show_bug.cgi?id=5991
 *
 * To detect these, we define a new scrollTop/Left getter/setter for both
 * document.documentElement and document.body. If the page only uses
 * scrollTop/Left on document.documentElement but not on document.body,
 * we will report it.
 */

addScriptToInject(function() {

// Only check when browser is in standards mode, since IE and Chrome are the
// same in quirks mode.
if (chrome_comp.inQuirksMode())
  return;

chrome_comp.CompDetect.declareDetector(

'scroll_top_left',

chrome_comp.CompDetect.NonScanDomBaseDetector,

function constructor(rootNode) {
  // Index into the array: 0: docElement.scrollLeft, 1: docElement.scrollTop,
  // 2: body.scrollLeft, 3: body.scrollTop.
  this.getterCallStacks_ = [];
  this.getterResults_ = [];
  this.lastCaller_ = null;

  this.onGetterCalled_ = function(id, result) {
    // caller 1 is anonymous function parameter in registerSimplePropertyHook.
    // caller 2 is ExistingMethodHookObject.newMethodHandler_.
    // caller 3 is the original caller.
    var caller = arguments.callee.caller.caller.caller;
    if (caller == this.lastCaller_) {
      // Only record the first occurrence in one function.
      if (this.getterCallStacks_[id])
        return;
    } else {
      this.checkUnpairedGetterCalls_();
      this.lastCaller_ = caller;
    }

    var callerSource = caller.toString();

    switch (id) {
      case 0:
        if (callerSource.indexOf('pageXOffset') != -1 ||
            callerSource.indexOf('scrollX') != -1 ||
            callerSource.indexOf('body.scrollLeft') != -1)
          return;
        break;
      case 1:
        if (callerSource.indexOf('pageYOffset') != -1 ||
            callerSource.indexOf('scrollY') != -1 ||
            callerSource.indexOf('body.scrollTop') != -1)
          return;
        break;
      case 2:
        if (callerSource.indexOf('pageXOffset') != -1 ||
            callerSource.indexOf('scrollX') != -1 ||
            callerSource.indexOf('documentElement.scrollLeft') != -1)
          return;
        break;
      case 3:
        if (callerSource.indexOf('pageYOffset') != -1 ||
            callerSource.indexOf('scrollY') != -1 ||
            callerSource.indexOf('documentElement.scrollTop') != -1)
          return;
        break;
    }

    var stack = chrome_comp.dumpStack();
    if (!chrome_comp.isCalledFromExtension(stack)) {
      this.getterCallStacks_[id] = stack;
      this.getterResults_[id] = result;
    }
  };

  this.checkUnpairedGetterCalls_ = function() {

    if (this.getterCallStacks_[0] && !this.getterCallStacks_[2]) {
      // documentElement.scrollLeft without paired body.scrollLeft.
      this.addProblem('BX9008', {stack: this.getterCallStacks_[0]});
    } else if (!this.getterCallStacks_[0] && this.getterCallStacks_[2] &&
        !this.getterResults_[2]) {
      // body.scrollLeft without paired documentElement.scrollLeft.
      // Omit the case when body.scrollLeft is not zero, because in
      // 'body.scrollLeft || docElement.scrollLeft', 'docElement.scrollLeft'
      // won't be called.
      this.addProblem('BX9008', {stack: this.getterCallStacks_[2]});
    }

    if (this.getterCallStacks_[1] && !this.getterCallStacks_[3]) {
      // docElement.scrollTop without paired body.scrollTop
      this.addProblem('BX9008', {stack: this.getterCallStacks_[1]});
    } else if (!this.getterCallStacks_[1] && this.getterCallStacks_[3] &&
        !this.getterResults_[3]) {
      // body.scrollTop without paired docElement.scrollTop.
      // Omit the case when body.scrollTop is not zero, because in
      // 'body.scrollTop || docElement.scrollTop', 'docElement.scrollTop'
      // won't be called.
      this.addProblem('BX9008', {stack: this.getterCallStacks_[3]});
    }

    this.getterCallStacks_ = [];
    this.getterResults_ = [];
  };

  this.setUpDocumentElementHooks_ = function() {
    var docElement = document.documentElement;
    var This = this;
    chrome_comp.CompDetect.registerSimplePropertyHook(docElement, 'scrollLeft',
        function(oldValue, newValue, reason) {
          if (reason == 'get')
            This.onGetterCalled_(0, 0);
          return 0;
        }, false, true);
    chrome_comp.CompDetect.registerSimplePropertyHook(docElement, 'scrollTop',
        function(oldValue, newValue, reason) {
          if (reason == 'get')
            This.onGetterCalled_(1, 0);
          return 0;
        }, false, true);
  };

  this.bodyHooksReady_ = false;

  // Hook document.body.scrollTop/Left.
  this.setUpBodyHooks_ = function() {
    if (this.bodyHooksReady_)
      return;
    this.bodyHooksReady_ = true;
    var This = this;
    chrome_comp.CompDetect.registerSimplePropertyHook(
        document.body, 'scrollLeft',
        function(oldValue, newValue, reason) {
          if (reason == 'get') {
            var result = window.scrollX;
            This.onGetterCalled_(2, result);
            return result;
          } else {
            window.scrollTo(newValue, window.scrollY);
          }
        }, false, true);
    chrome_comp.CompDetect.registerSimplePropertyHook(
        document.body, 'scrollTop',
        function(oldValue, newValue, reason) {
          if (reason == 'get') {
            var result = window.scrollY;
            This.onGetterCalled_(3, result);
            return result;
          } else {
            window.scrollTo(window.scrollX, newValue);
          }
        }, false, true);
  };

},

function setUp() {
  this.setUpDocumentElementHooks_();

  if (document.body) {
    this.setUpBodyHooks_();
    return;
  }

  // The document.body may not be present here. If so, we create a
  // document.body property hook that returns the first element with tag name
  // 'body'.
  var originalGetter = document.__lookupGetter__('body');
  if (!originalGetter) {
    var body = null;
    originalGetter = function() {
      if (!body) {
        var bodies = document.getElementsByTagName('body');
        if (bodies)
          body = bodies[0];
      }
      return body;
    };
  }
  var This = this;
  chrome_comp.CompDetect.registerSimplePropertyHook(document, 'body',
      function(oldValue, newValue, reason) {
        if (reason == 'get') {
          var body = originalGetter.apply(document);
          if (body)
            This.setUpBodyHooks_();
        }
        return body;
      }, true, true);
},

function cleanUp() {
  // We can do nothing here, since we cannot remove the simple property hooks
  // and document.body hook.
  // Remove them will cause some standard page features broken.
},

function postAnalyze() {
  this.checkUnpairedGetterCalls_();
  this.lastCaller_ = null;
}

); // declareDetector

});
