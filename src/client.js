import objectAssign from 'object-assign'
import uuid from 'node-uuid'
import when from 'when'

if(!window.io){
  throw new Error('Socket IO is missing. ' +
    'Make sure you loaded socket.io.js'
  )
}


/**
 * Transpose the variables within a topic with the values of a
 * given context.
 * Returns null if the context does not contain all the variables.
 */
function transposeTopic(topic, context) {
  const dependencies = getDependencies(topic)
  let dependency

  while(dependency = dependencies.pop()){
    let value = context[dependency]

    if(value){
      topic = topic.replace(
        new RegExp(`\\[${dependency}\\]`, 'g'),
        value
      )
    }
    else{
      return null
    }
  }

  return topic
}



/**
 * Extract transposable variables from topic string
 * and returns them as an array
 */
function getDependencies(topic){
  const reg = /\[([^\]]*)\]/gi
  const dependencies = []
  let dependency

  while(dependency = reg.exec(topic)){
    dependencies.push(dependency[1])
  }

  return dependencies
}


export default class Domino {
  constructor(url) {
    this.context = {}
    this.registry = {}
    this.topics = []
    this.promesses = {}

    this.socket = io()
    this.socket.on('change', this.changeReceived.bind(this))
    this.socket.on('response', this.responseReceived.bind(this))
  }

  setContext (newContext) {
    const oldContext = context
    context = objectAssign({}, newContext)

    this.refresh(context, oldContext)
  }

  updateContext (newContext) {
    const oldContext = context
    context = objectAssign({}, context, newContext)

    this.refresh(context, oldContext)
  }

  refresh(context, oldContext){
    this.topics = [] // flush the existing topics

    for(let topic of this.registry){
      let old_topic = transposeTopic(topic, oldContext)
      let new_topic = transposeTopic(topic, context)

      if(old_topic != new_topic){
        this.unsubscribe(old_topic)
        this.subscribe(new_topic)
      }

      if(new_topic){
        this.topics.push({
          callback: this.registry[topic].callback,
          test: this.createMatchingMethod(new_topic)
        })
      }
    }
  }

  /**
   * Register a single given endpoint.
   *
   * Build the channel from the context and attach the given
   * callback to its change events.
   */
  register(topic, callback){
    const endpoint = {topic, callback}

    this.registry[endpoint.topic] = endpoint

    const contextualTopic = transposeTopic(endpoint.topic, this.context)

    if(contextualTopic){
      this.subscribe(contextualTopic)
      this.topics.push({
        callback: this.registry[endpoint.topic].callback,
        test: this.createMatchingMethod(endpoint.topic)
      })
    }
  }

  createMatchingMethod (topic) {
    var topicStr, regExp;

    topicStr = topic
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[a-z0-9_]+')

    regExp = RegExp(topicStr)

    return regExp.test.bind(regExp)
  }

  action(action, payload){
    const correlationId = uuid.v4()
    const deferred = when.defer()

    this.promesses[correlationId] = deferred
    this.socket.emit(
      'action',
      {
        type: action,
        payload: payload,
        corr: correlationId
      }
    );

    return deferred.promise
  }

  subscribe(topic){
    if(topic){
      this.socket.emit('subscribe', topic)
      console.info(`Subcribing to channel ${topic}`)
    }
  }


  unsubscribe(topic){
    if(topic){
      this.socket.emit('unsubscribe', topic)
      console.info(`Unsubcribing to channel ${topic}`)
    }
  }

  responseReceived (message) {
    const promise = this.promesses[message.correlationId]

    if(promise){
      if(message.status == 'ok') {
        promise.resolve(message.content)
      }
      else {
        promise.reject(message.content)
      }
    }
  }

  changeReceived (message) {
    for(let i = 0; i < this.topics.length ; i++){
      let topic = this.topics[i]

      if(topic.test(message.key)){
        topic.callback(message.content, message.key)
      }
    }
    console.log('Change received', message)
  }
}
