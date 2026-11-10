import { Readable } from "node:stream"
import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  createAudioPlayer,
  NoSubscriberBehavior,
  createAudioResource,
  StreamType,
} from "@discordjs/voice"
import { createSpeakQueue } from "./audio.js"

export function resolveVoiceTarget(interaction) {
  const userId = interaction?.user?.id
  return interaction?.guild?.voiceStates?.cache?.get(userId)?.channelId
    ?? interaction?.member?.voice?.channelId
    ?? null
}

export function createVoiceInteractionDeps(joinVoice, leaveVoice) {
  return { resolveVoiceTarget, joinVoice, leaveVoice }
}

export function createVoiceState() {
  return {
    joined: false,
    guildId: null,
    channelId: null,
    connection: null,
    player: null,
    speakQueue: null,
  }
}

export function joinVoice(state, guildId, channelId, connection) {
  state.joined = true
  state.guildId = guildId
  state.channelId = channelId
  state.connection = connection
  if (!state.player) {
    state.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    })
  }
  if (!state.speakQueue) {
    state.speakQueue = createSpeakQueue({
      player: state.player,
      createResource: createResourceFromBuffer,
      isJoined: () => isJoined(state),
    })
  }
  return state
}

export function leaveVoice(state) {
  state.joined = false
  state.speakQueue?.clear()
  state.speakQueue = null
  state.player?.stop(true)
  state.guildId = null
  state.channelId = null
  if (state.connection) {
    state.connection.destroy()
    state.connection = null
  }
  state.player = null
  return state
}

export function connectVoice({ guildId, channelId, adapterCreator, selfMute = false, selfDeaf = true }) {
  return joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator,
    selfMute,
    selfDeaf,
  })
}

export function createVoiceJoinHandler({ channels, state, connect = connectVoice }) {
  return async function join(guildId, channelId) {
    const target = channels.cache.get(channelId)
    if (
      !target ||
      !target.isVoiceBased?.() ||
      target.guildId !== guildId ||
      !target.guild?.voiceAdapterCreator
    ) return false

    const connection = connect({
      guildId,
      channelId,
      adapterCreator: target.guild.voiceAdapterCreator,
    })
    if (!connection) return false

    joinVoice(state, guildId, channelId, connection)
    connection.subscribe(state.player)
    return true
  }
}

export function isJoined(state) {
  return Boolean(state?.joined && state?.connection)
}

export function createVoicePlayer() {
  return createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  })
}

export function createResourceFromBuffer(buffer) {
  return createAudioResource(Readable.from([buffer], { objectMode: false }), { inputType: StreamType.Raw })
}

export function getConnectionForGuild(guildId) {
  return getVoiceConnection(guildId)
}

export function connectionStatus(connection) {
  return connection?.state?.status ?? VoiceConnectionStatus.Destroyed
}

export function playerStatus(player) {
  return player?.state?.status ?? AudioPlayerStatus.Idle
}
