'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _objectAssign = require('object-assign');

var _objectAssign2 = _interopRequireDefault(_objectAssign);

var _nodeUuid = require('node-uuid');

var _nodeUuid2 = _interopRequireDefault(_nodeUuid);

var _when = require('when');

var _when2 = _interopRequireDefault(_when);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

if (!window.io) {
  throw new Error('Socket IO is missing. ' + 'Make sure you loaded socket.io.js');
}

/**
 * Transpose the variables within a topic with the values of a
 * given context.
 * Returns null if the context does not contain all the variables.
 */
function transposeTopic(topic, context) {
  var dependencies = getDependencies(topic);
  var dependency = void 0;

  while (dependency = dependencies.pop()) {
    var value = context[dependency];

    if (value) {
      topic = topic.replace(new RegExp('\\[' + dependency + '\\]', 'g'), value);
    } else {
      return null;
    }
  }

  return topic;
}

/**
 * Extract transposable variables from topic string
 * and returns them as an array
 */
function getDependencies(topic) {
  var reg = /\[([^\]]*)\]/gi;
  var dependencies = [];
  var dependency = void 0;

  while (dependency = reg.exec(topic)) {
    dependencies.push(dependency[1]);
  }

  return dependencies;
}

var Domino = function () {
  function Domino(url) {
    _classCallCheck(this, Domino);

    this.context = {};
    this.registry = {};
    this.topics = [];
    this.promesses = {};

    this.socket = io();
    this.socket.on('change', this.changeReceived.bind(this));
    this.socket.on('response', this.responseReceived.bind(this));
  }

  _createClass(Domino, [{
    key: 'setContext',
    value: function setContext(newContext) {
      var oldContext = context;
      context = (0, _objectAssign2.default)({}, newContext);

      this.refresh(context, oldContext);
    }
  }, {
    key: 'updateContext',
    value: function updateContext(newContext) {
      var oldContext = context;
      context = (0, _objectAssign2.default)({}, context, newContext);

      this.refresh(context, oldContext);
    }
  }, {
    key: 'refresh',
    value: function refresh(context, oldContext) {
      this.topics = []; // flush the existing topics

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = this.registry[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var topic = _step.value;

          var old_topic = transposeTopic(topic, oldContext);
          var new_topic = transposeTopic(topic, context);

          if (old_topic != new_topic) {
            this.unsubscribe(old_topic);
            this.subscribe(new_topic);
          }

          if (new_topic) {
            this.topics.push({
              callback: this.registry[topic].callback,
              test: this.createMatchingMethod(new_topic)
            });
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }

    /**
     * Register a single given endpoint.
     *
     * Build the channel from the context and attach the given
     * callback to its change events.
     */

  }, {
    key: 'register',
    value: function register(topic, callback) {
      var endpoint = { topic: topic, callback: callback };

      this.registry[endpoint.topic] = endpoint;

      var contextualTopic = transposeTopic(endpoint.topic, this.context);

      if (contextualTopic) {
        this.subscribe(contextualTopic);
        this.topics.push({
          callback: this.registry[endpoint.topic].callback,
          test: this.createMatchingMethod(endpoint.topic)
        });
      }
    }
  }, {
    key: 'createMatchingMethod',
    value: function createMatchingMethod(topic) {
      var topicStr, regExp;

      topicStr = topic.replace(/\./g, '\\.').replace(/\*/g, '[a-z0-9_]+');

      regExp = RegExp(topicStr);

      return regExp.test.bind(regExp);
    }
  }, {
    key: 'action',
    value: function action(_action, payload) {
      var correlationId = _nodeUuid2.default.v4();
      var deferred = _when2.default.defer();

      this.promesses[correlationId] = deferred;
      this.socket.emit('action', {
        type: _action,
        payload: payload,
        corr: correlationId
      });

      return deferred.promise;
    }
  }, {
    key: 'subscribe',
    value: function subscribe(topic) {
      if (topic) {
        this.socket.emit('subscribe', topic);
        console.info('Subcribing to channel ' + topic);
      }
    }
  }, {
    key: 'unsubscribe',
    value: function unsubscribe(topic) {
      if (topic) {
        this.socket.emit('unsubscribe', topic);
        console.info('Unsubcribing to channel ' + topic);
      }
    }
  }, {
    key: 'responseReceived',
    value: function responseReceived(message) {
      var promise = this.promesses[message.correlationId];

      if (promise) {
        if (message.status == 'ok') {
          promise.resolve(message.content);
        } else {
          promise.reject(message.content);
        }
      }

      console.log('Response received', message);
    }
  }, {
    key: 'changeReceived',
    value: function changeReceived(message) {
      for (var i = 0; i < this.topics.length; i++) {
        var topic = this.topics[i];

        if (topic.test(message.key)) {
          topic.callback(message.content, message.key);
        }
      }
      console.log('Change received', message);
    }
  }]);

  return Domino;
}();

exports.default = Domino;