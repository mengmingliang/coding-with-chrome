/**
 * @fileoverview Code Editor for the Coding with Chrome editor.
 *
 * @license Copyright 2015 The Coding with Chrome Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @author mbordihn@google.com (Markus Bordihn)
 */
goog.provide('cwc.ui.Editor');

goog.require('cwc.UserConfig');
goog.require('cwc.soy.ui.Editor');
goog.require('cwc.ui.EditorAutocompleteBlacklistCodes');
goog.require('cwc.ui.EditorAutocompleteBlacklistKeys');
goog.require('cwc.ui.EditorAutocompleteList');
goog.require('cwc.ui.EditorContent');
goog.require('cwc.ui.EditorHint');
goog.require('cwc.ui.EditorInfobar');
goog.require('cwc.ui.EditorToolbar');
goog.require('cwc.ui.EditorType');
goog.require('cwc.ui.EditorView');
goog.require('cwc.utils.Events');
goog.require('cwc.utils.Logger');

goog.require('goog.array');
goog.require('goog.async.Throttle');
goog.require('goog.dom');
goog.require('goog.dom.TagName');
goog.require('goog.dom.ViewportSizeMonitor');
goog.require('goog.events.EventTarget');
goog.require('goog.soy');
goog.require('goog.ui.Component.EventType');


/**
 * Customizable Code Editor.
 * @param {!cwc.utils.Helper} helper
 * @constructor
 * @struct
 * @final
 */
cwc.ui.Editor = function(helper) {
  /** @type {string} */
  this.name = 'Editor';

  /** @type {!cwc.utils.Helper} */
  this.helper = helper;

  /** @type {string} */
  this.prefix = this.helper.getPrefix('editor');

  /** @type {CodeMirror} */
  this.editor = null;

  /** @type {Object} */
  this.editorView = {};

  /** @type {string} */
  this.currentEditorView = '';

  /** @type {string} */
  this.cursorPosition = '';

  /** @type {boolean} */
  this.modified = false;

  /** @type {goog.events.EventTarget} */
  this.eventTarget = new goog.events.EventTarget();

  /** @type {Element} */
  this.node = null;

  /** @type {cwc.ui.EditorInfobar} */
  this.infobar = null;

  /** @type {cwc.ui.EditorToolbar} */
  this.toolbar = null;

  /** @type {!Array} */
  this.rulers = [{'color': '#ccc', 'column': 80, 'lineStyle': 'dashed'}];

  /** @type {string} */
  this.theme = 'default';

  /** @type {cwc.ui.StatusBar} */
  this.statusBar = null;

  /** @private {!cwc.utils.Events} */
  this.events_ = new cwc.utils.Events(this.name, '', this);

  /** @private {cwc.ui.EditorHint|string} */
  this.editorHint_ = cwc.ui.EditorHint.UNKNOWN;

  /** @private {boolean} */
  this.editorHintEnable_ = true;

  /** @private {!Object} */
  this.editorHintGlobals_ = cwc.ui.EditorAutocompleteList.getGlobals();

  /** @private {!Object} */
  this.editorHintLocals_ = {};

  /** @private {cwc.ui.EditorType|string} */
  this.editorType_ = cwc.ui.EditorType.UNKNOWN;

  /** @private {Object} */
  this.options_ = {
    'autoCloseBrackets': true,
    'autoCloseTags': true,
    'foldGutter': true,
    'gutters': [
      'CodeMirror-linenumbers',
      'CodeMirror-foldgutter',
      'CodeMirror-lint-markers',
    ],
    'highlightSelectionMatches': {'showToken': /\w/},
    'hint': this.editorHint_,
    'lineNumbers': true,
    'matchTags': {'bothTags': true},
    'rulers': this.rulers,
    'showTrailingSpace': true,
    'styleActiveLine': true,
    'theme': this.theme,
    'foldOptions': {
      'widget': '\u22EF',
    },
    'onUpdateLinting': this.handleLint_.bind(this),
  };

  /** @private {boolean} */
  this.isVisible_ = true;

  /** @private {number} */
  this.syncThrottleTime_ = 2000;

  /** @private {goog.async.Throttle} */
  this.syncThrottle_ = new goog.async.Throttle(
    this.syncJavaScript.bind(this), this.syncThrottleTime_);

  /** @private {!cwc.utils.Logger|null} */
  this.log_ = new cwc.utils.Logger(this.name);
};


/**
 * Decorates the given node and adds the code editor.
 * @param {Element=} node The target node to add the code editor.
 */
cwc.ui.Editor.prototype.decorate = function(node) {
  this.node = node || goog.dom.getElement(this.prefix + 'chrome');
  if (!this.node) {
    this.log_.error('Invalid Editor node:', this.node);
    return;
  }

  // Clear existing informations.
  this.currentEditorView = null;
  this.editorView = {};
  this.modified = false;

  // Render code editor template.
  this.log_.debug('Decorate', this.name, 'into node', this.node);
  goog.soy.renderElement(
    this.node, cwc.soy.ui.Editor.template, {prefix: this.prefix}
  );

  // Decorate editor
  this.decorateEditor(goog.dom.getElement(this.prefix + 'code'));

  // Decorate toolbar.
  let nodeToolbar = goog.dom.getElement(this.prefix + 'toolbar');
  if (nodeToolbar) {
    this.toolbar = new cwc.ui.EditorToolbar(this.helper);
    this.toolbar.decorate(nodeToolbar);
  }

  // Decorate infobar.
  let nodeInfobar = goog.dom.getElement(this.prefix + 'infobar');
  if (nodeInfobar) {
    this.infobar = new cwc.ui.EditorInfobar(this.helper);
    this.infobar.decorate(nodeInfobar);
  }

  // Loading User settings.
  let userConfigInstance = this.helper.getInstance('userConfig');
  if (userConfigInstance) {
    this.editorHintEnable_ = userConfigInstance.get(cwc.userConfigType.EDITOR,
      cwc.userConfigName.AUTO_COMPLETE);
  }

  // Add event listener to monitor changes like resize and unload.
  let layoutInstance = this.helper.getInstance('layout');
  if (layoutInstance) {
    let eventTarget = layoutInstance.getEventTarget();
    this.events_.listen(eventTarget, goog.events.EventType.RESIZE,
      this.refreshEditor);
    this.events_.listen(eventTarget, goog.events.EventType.UNLOAD,
      this.cleanUp_);
  }

  // Cache Status bar
  this.statusBar = this.helper.getInstance('statusBar');
};


/**
 * Decorate code editor.
 * @param {Element=} node
 */
cwc.ui.Editor.prototype.decorateEditor = function(node) {
  this.editor = new CodeMirror(node, this.options_);
  this.editor.setOption('extraKeys', {
    'Ctrl-Q': function(cm) {
      cm.foldCode(cm.getCursor());
    },
    'Ctrl-J': 'toMatchingTag',
    'Cmd-Enter': this.runPreview_.bind(this),
    'Ctrl-Enter': this.runPreview_.bind(this),
    'Cmd-Space': 'autocomplete',
    'Ctrl-Space': 'autocomplete',
  });
  this.editor.on('change', this.handleChange_.bind(this));
  this.editor.on('cursorActivity', this.updateCursorPosition.bind(this));
  this.editor.on('keyup', this.handleKeyUp_.bind(this));
};


/**
 * Shows/Hides the editor.
 * @param {boolean} visible
 */
cwc.ui.Editor.prototype.showEditor = function(visible) {
  goog.style.setElementShown(this.node, visible);
  this.isVisible_ = visible;
  this.refreshEditor();
};


/**
 * Shows/Hide the expand button.
 * @param {boolean} visible
 */
cwc.ui.Editor.prototype.showExpandButton = function(visible) {
  if (this.toolbar) {
    this.toolbar.showExpandButton(visible);
  }
};


/**
 * Shows/Hide the editor type like "text/javascript" inside the info bar.
 * @param {boolean} visible
 */
cwc.ui.Editor.prototype.showMode = function(visible) {
  if (this.infobar) {
    this.infobar.showMode(visible);
  }
};


/**
 * @param {string} name
 * @param {!function()} func
 * @param {string=} tooltip
 */
cwc.ui.Editor.prototype.addOption = function(name, func, tooltip) {
  if (this.toolbar) {
    this.toolbar.addOption(name, func, tooltip);
  }
};


/**
 * Returns Editor code mode.
 * @return {string}
 */
cwc.ui.Editor.prototype.getEditorMode = function() {
  return this.editor.getOption('mode');
};


/**
 * Sets the Editor Mode to the selected mode.
 * @param {!(cwc.ui.EditorType|string)} mode Editor code mode.
 */
cwc.ui.Editor.prototype.setEditorMode = function(mode) {
  if (mode && mode !== this.editorType_) {
    this.log_.info('Set editor mode to', mode);
    this.editor.setOption('mode', mode);
    this.updateInfobar();
    this.updateStatusBar();
    this.updateToolbar();
    this.refreshEditor();
    this.editorType_ = mode;
  }
};


/**
 * Sets and enabled specific editor hints.
 * @param {!cwc.ui.EditorHint} hints
 */
cwc.ui.Editor.prototype.setEditorHints = function(hints) {
  if (hints && hints !== this.editorHint_) {
    this.log_.info('Set global editor hint to', hints);
    this.editor.setOption('hintOptions', CodeMirror['hint'][hints]);
    this.refreshEditor();
    this.editorHint_ = hints;
  }
};


/**
 * @param {!Object} hints
 */
cwc.ui.Editor.prototype.setLocalHints = function(hints) {
  if (hints && hints !== this.editorHintLocals_) {
    this.log_.info('Set local editor hint to', hints);
    this.editorHintLocals_ = hints;
  }
};


/**
 * @param {string=} name
 * @return {Object|string}
 */
cwc.ui.Editor.prototype.getEditorContent = function(name) {
  let editorContent = {};

  if (name) {
    if (name in this.editorView) {
      return this.editorView[name].getContent();
    } else {
      this.log_.error('Editor content', name, 'is not defined!');
    }
  } else {
    for (let view in this.editorView) {
      if (this.editorView.hasOwnProperty(view)) {
        editorContent[view] = this.editorView[view].getContent();
      }
    }
  }
  return editorContent;
};


/**
 * @param {string} content
 * @param {string=} view
 */
cwc.ui.Editor.prototype.setEditorContent = function(content,
    view = cwc.ui.EditorContent.DEFAULT) {
  if (view in this.editorView) {
    if (content !== this.editorView[view].getContent()) {
      this.editorView[view].setContent(content);
    }
  } else {
    this.log_.error('Editor view', view, 'is unknown!');
  }
};


/**
 * Sync JavaScript content from other modules.
 */
cwc.ui.Editor.prototype.syncJavaScript = function() {
  let fileUi = this.helper.getInstance('file').getUi();
  let blocklyInstance = this.helper.getInstance('blockly');
  switch (fileUi) {
    case 'blockly':
      if (blocklyInstance) {
        this.setEditorContent(
          blocklyInstance.getJavaScript(), cwc.ui.EditorContent.JAVASCRIPT);
      }
      break;
    default:
      this.log_.info('Unsynced UI mode', fileUi);
  }
};

/**
 * Syntax checks for supported formats.
 * @param {boolean} active
 */
cwc.ui.Editor.prototype.setSyntaxCheck = function(active) {
  this.editor.setOption('lint', active);
};


/**
 * Refreshes the Editor to avoid CSS issues.
 */
cwc.ui.Editor.prototype.refreshEditor = function() {
  this.editor.refresh();
};


/**
 * Undo the last change in the editor.
 * @return {Object}
 */
cwc.ui.Editor.prototype.undoChange = function() {
  this.editor.undo();
  return this.editor.historySize();
};


/**
 * Redo the last change in the editor.
 * @return {Object}
 */
cwc.ui.Editor.prototype.redoChange = function() {
  this.editor.redo();
  return this.editor.historySize();
};


/**
 * Selects all in the editor.
 */
cwc.ui.Editor.prototype.selectAll = function() {
  this.cursorPosition = this.editor.getCursor();
  this.editor.execCommand('selectAll');
};


/**
 * Clears selection in the editor.
 */
cwc.ui.Editor.prototype.selectNone = function() {
  let position = this.cursorPosition || this.editor.getCursor('start');
  this.editor.setCursor(position);
};


/**
 * Insert the text at the current cursor position.
 * @param {string} text
 */
cwc.ui.Editor.prototype.insertText = function(text) {
  this.editor.replaceSelection(text);
  this.selectNone();
};


/**
 * Change editor view to the given name.
 * @param {string} name
 */
cwc.ui.Editor.prototype.changeView = function(name) {
  if (!name || !this.editor || this.currentEditorView === name) {
    return;
  }

  if (!(name in this.editorView)) {
    this.log_.error('View "' + name + '" not exists!');
    return;
  }

  this.log_.info('Change view to', name);
  let editorView = this.editorView[name];
  this.editor.swapDoc(editorView.getDoc());
  this.currentEditorView = name;
  this.setEditorMode(editorView.getType());
  this.setEditorHints(editorView.getHints());
  this.updateInfobar();
  this.refreshEditor();
};


/**
 * Adds a new editor view with the given name.
 * @param {string} name
 * @param {string=} content
 * @param {cwc.ui.EditorType=} type
 * @param {cwc.ui.EditorHint=} hints
 */
cwc.ui.Editor.prototype.addView = function(name, content = '', type, hints) {
  if (name in this.editorView) {
    this.log_.error('View', name, 'already exists!');
    return;
  }

  this.log_.info('Create view', name,
    (type ? 'with type ' + type : ''),
    (hints ? 'and hints ' + hints : ''),
    (content ? 'for content:' : ''), content);
  this.editorView[name] = new cwc.ui.EditorView(content, type, hints);
  this.updateToolbar();
  if (!this.currentEditorView) {
    this.changeView(name);
  } else {
    this.updateInfobar();
  }
};


/**
 * @param {string} name
 * @return {cwc.ui.EditorView}
 */
cwc.ui.Editor.prototype.getView = function(name) {
  if (!(name in this.editorView)) {
    this.log_.error('Editor View', name, 'is unknown!');
    return null;
  }

  return this.editorView[name];
};


/**
 * @return {Object}
 */
cwc.ui.Editor.prototype.getViews = function() {
  return this.editorView;
};


/**
 * @return {string}
 */
cwc.ui.Editor.prototype.getCurrentView = function() {
  return this.currentEditorView;
};


/**
 * @param {goog.events.EventLike=} opt_event
 */
cwc.ui.Editor.prototype.handleSyncEvent = function(opt_event) {
  if (opt_event && opt_event['recordUndo'] === false) {
    return;
  }

  if (opt_event['type'] === Blockly.Events.MOVE &&
      !opt_event['newInputName'] && !opt_event['newParentId'] &&
      opt_event['newInputName'] === opt_event['oldInputName'] &&
      opt_event['newParentId'] === opt_event['oldParentId']) {
    return;
  }

  this.syncThrottle_.fire();
};


/**
 * @return {goog.events.EventTarget}
 */
cwc.ui.Editor.prototype.getEventTarget = function() {
  return this.eventTarget;
};


/**
 * @return {boolean}
 */
cwc.ui.Editor.prototype.isModified = function() {
  return this.modified;
};


/**
 * @return {boolean}
 */
cwc.ui.Editor.prototype.isVisible = function() {
  return this.isVisible_;
};


/**
 * @param {boolean} modified
 */
cwc.ui.Editor.prototype.setModified = function(modified) {
  this.modified = modified;
};


/**
 * Updates the editor Infobar.
 */
cwc.ui.Editor.prototype.updateInfobar = function() {
  if (!this.infobar) {
    return;
  }
  this.log_.info('Update Infobar...');
  this.infobar.setLineInfo({
    'line': 0,
    'ch': 0,
  });
  this.infobar.setViews(Object.keys(this.editorView), this.currentEditorView);
};


/**
 * Updates the status bar.
 */
cwc.ui.Editor.prototype.updateStatusBar = function() {
  if (!this.statusBar) {
    return;
  }
  this.statusBar.setEditorMode(this.getEditorMode());
};


/**
 * Updates the editor Toolbar.
 */
cwc.ui.Editor.prototype.updateToolbar = function() {
  if (!this.toolbar) {
    return;
  }
  let editorMode = this.getEditorMode();
  if (editorMode !== this.editorType_) {
    this.log_.info('Update Toolbar for', editorMode);
    this.toolbar.updateToolbar(editorMode);
  }
};


/**
 * Updates the cursor position within the editor.
 * @param {CodeMirror} cm
 */
cwc.ui.Editor.prototype.updateCursorPosition = function(cm) {
  if (this.infobar) {
    this.infobar.setLineInfo(cm.getCursor());
  }
};


/**
 * Handles changes on the content.
 * @private
 */
cwc.ui.Editor.prototype.handleChange_ = function() {
  if (!this.modified) {
    this.modified = true;
    if (this.toolbar) {
      this.toolbar.enableUndoButton(this.modified);
    }
  }
  let guiInstance = this.helper.getInstance('gui');
  if (guiInstance) {
    guiInstance.setStatus(this.modified ? '*' : '');
  }
  this.eventTarget.dispatchEvent(goog.ui.Component.EventType.CHANGE);
};


/**
 * Handles key up events inside the editor.
 * @param {CodeMirror} cm
 * @param {Object} e
 * @private
 */
cwc.ui.Editor.prototype.handleKeyUp_ = function(cm, e) {
  if (!this.editorHintEnable_ ||
      !cm || cm['state']['completionActive'] ||
      typeof cwc.ui.EditorAutocompleteBlacklistCodes[e.code] !== 'undefined' ||
      typeof cwc.ui.EditorAutocompleteBlacklistKeys[e.key] !== 'undefined') {
    return;
  }
  CodeMirror.commands.autocomplete(cm, null, {
    'completeSingle': false,
    'globalScope': Object.assign(
      this.editorHintGlobals_, this.editorHintLocals_),
  });
};


/**
 * @param {Object} e
 * @private
 */
cwc.ui.Editor.prototype.handleLint_ = function(e) {
  this.log_.info('lint', e);
};


/**
 * Cleans up the event listener and any other modification.
 * @private
 */
cwc.ui.Editor.prototype.cleanUp_ = function() {
  this.events_.clear();
  this.modified = false;
};


/**
 * @private
 */
cwc.ui.Editor.prototype.runPreview_ = function() {
  let previewInstance = this.helper.getInstance('preview');
  if (previewInstance) {
    previewInstance.run();
  }
};
