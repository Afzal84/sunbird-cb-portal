import { AfterViewInit, Component, ElementRef, HostBinding, Input, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { NsWidgetResolver, WidgetBaseComponent } from '@sunbird-cb/resolver'
import { EventService } from '@sunbird-cb/utils'
import videoJs from 'video.js'
import { ROOT_WIDGET_CONFIG } from '../collection.config'
import { IWidgetsPlayerMediaData } from '../_models/player-media.model'
import {
  fireRealTimeProgressFunction,
  saveContinueLearningFunction,
  telemetryEventDispatcherFunction,
  videoInitializer,
  videoJsInitializer,
} from '../_services/videojs-util'
import { WidgetContentService } from '../_services/widget-content.service'
import { ViewerUtilService } from '@ws/viewer/src/lib/viewer-util.service'

const videoJsOptions: videoJs.PlayerOptions = {
  controls: true,
  autoplay: false,
  preload: 'auto',
  fluid: false,
  techOrder: ['html5'],
  playbackRates: [0.75, 0.85, 1, 1.25, 2, 3],
  poster: '',
  html5: {
    hls: {
      overrideNative: true,
    },
    nativeVideoTracks: false,
    nativeAudioTracks: false,
    nativeTextTracks: false,
  },
  nativeControlsForTouch: false,
}

@Component({
  selector: 'ws-widget-player-video',
  templateUrl: './player-video.component.html',
  styleUrls: ['./player-video.component.scss'],
})
export class PlayerVideoComponent extends WidgetBaseComponent
  implements
  OnInit,
  AfterViewInit,
  OnDestroy,
  NsWidgetResolver.IWidgetData<IWidgetsPlayerMediaData> {
  @Input() widgetData!: IWidgetsPlayerMediaData
  @ViewChild('videoTag', { static: false }) videoTag!: ElementRef<HTMLVideoElement>
  @ViewChild('realvideoTag', { static: false }) realvideoTag!: ElementRef<HTMLVideoElement>
  @HostBinding('id')
  public id = 'v-player'
  private player: videoJs.Player | null = null
  private dispose: (() => void) | null = null
  // Subtitle persistence keys — single source of truth for localStorage
  private readonly SUBTITLE_LANGUAGE_KEY = 'selectedSubtitleLanguage'
  private readonly SUBTITLE_ENABLED_KEY = 'subtitleEnabled'
  // Guard to prevent duplicate texttrackchange listeners across re-initializations
  private textTrackChangeListenerAdded = false
  constructor(
    private eventSvc: EventService,
    private contentSvc: WidgetContentService,
    private viewerSvc: ViewerUtilService,
    private activatedRoute: ActivatedRoute,
  ) {
    super()
  }

  ngOnInit() { }

  async ngAfterViewInit() {
    this.widgetData = {
      ...this.widgetData,
    }
    if (this.widgetData && this.widgetData.identifier && !this.widgetData.url) {
      await this.fetchContent()
    }
    if (this.widgetData.url) {
      if (this.widgetData.isVideojs) {
        this.initializePlayer()
      } else {
        this.initializeVPlayer()
      }
    }
  }
  ngOnDestroy() {
    if (this.player) {
      this.player.dispose()
    }
    if (this.dispose) {
      this.dispose()
    }
    // Reset listener guard so a fresh player instance can attach a new listener
    this.textTrackChangeListenerAdded = false
  }
  private initializeVPlayer() {
    const dispatcher: telemetryEventDispatcherFunction = event => {
      if (this.widgetData.identifier) {
        this.eventSvc.dispatchEvent(event)
      }
    }
    const saveCLearning: saveContinueLearningFunction = data => {
      if (this.widgetData.identifier) {

        if (this.activatedRoute.snapshot.queryParams.collectionType &&
          this.activatedRoute.snapshot.queryParams.collectionType.toLowerCase() === 'playlist') {
          const continueLearningData = {
            contextPathId: this.activatedRoute.snapshot.queryParams.collectionId ?
              this.activatedRoute.snapshot.queryParams.collectionId : this.widgetData.identifier,
            resourceId: data.resourceId,
            contextType: 'playlist',
            dateAccessed: Date.now(),
            data: JSON.stringify({
              progress: data.progress,
              timestamp: Date.now(),
              contextFullPath: [this.activatedRoute.snapshot.queryParams.collectionId, data.resourceId],
            }),
          }
          this.contentSvc
            .saveContinueLearning(continueLearningData)
            .toPromise()
            .catch()
        } else {
          const continueLearningData = {
            contextPathId: this.activatedRoute.snapshot.queryParams.collectionId ?
              this.activatedRoute.snapshot.queryParams.collectionId : this.widgetData.identifier,
            ...data,
            // resourceId: data.resourceId,
            // dateAccessed: Date.now(),
            // data: data.data,
          }
          // JSON.stringify({
          //   progress: data.progress,
          //   timestamp: Date.now(),
          // }),
          this.contentSvc
            .saveContinueLearning(continueLearningData)
            .toPromise()
            .catch()
        }
      }
    }
    const fireRProgress: fireRealTimeProgressFunction = (identifier, data) => {
      const collectionId = this.activatedRoute.snapshot.queryParams.collectionId ?
              this.activatedRoute.snapshot.queryParams.collectionId : this.widgetData.identifier
      const batchId = this.activatedRoute.snapshot.queryParams.batchId ?
              this.activatedRoute.snapshot.queryParams.batchId : this.widgetData.identifier

      if (this.widgetData.identifier && identifier && data) {
          this.viewerSvc
            .realTimeProgressUpdate(identifier, data, collectionId, batchId)
      }
    }
    if (this.widgetData.resumePoint && this.widgetData.resumePoint !== 0) {
      this.realvideoTag.nativeElement.currentTime = this.widgetData.resumePoint
    }
    let enableTelemetry = false
    if (!this.widgetData.disableTelemetry && typeof (this.widgetData.disableTelemetry) !== 'undefined') {
      enableTelemetry = true
    }
    this.dispose = videoInitializer(
      this.realvideoTag.nativeElement,
      dispatcher,
      saveCLearning,
      fireRProgress,
      this.widgetData.passThroughData,
      ROOT_WIDGET_CONFIG.player.video,
      enableTelemetry,
      this.widgetData,
      this.widgetData.mimeType,
    ).dispose
  }

  private initializePlayer() {
    const dispatcher: telemetryEventDispatcherFunction = event => {
      if (this.widgetData.identifier) {
        this.eventSvc.dispatchEvent(event)
      }
    }
    const saveCLearning: saveContinueLearningFunction = data => {
      if (this.widgetData.identifier) {
        if (this.activatedRoute.snapshot.queryParams.collectionType &&
          this.activatedRoute.snapshot.queryParams.collectionType.toLowerCase() === 'playlist') {
          const continueLearningData = {
            contextPathId: this.activatedRoute.snapshot.queryParams.collectionId ?
              this.activatedRoute.snapshot.queryParams.collectionId : this.widgetData.identifier,
            resourceId: data.resourceId,
            contextType: 'playlist',
            dateAccessed: Date.now(),
            data: JSON.stringify({
              progress: data.progress,
              timestamp: Date.now(),
              contextFullPath: [this.activatedRoute.snapshot.queryParams.collectionId, data.resourceId],
            }),
          }
          this.contentSvc
            .saveContinueLearning(continueLearningData)
            .toPromise()
            .catch()
        } else {
          const continueLearningData = {
            contextPathId: this.activatedRoute.snapshot.queryParams.collectionId
              ? this.activatedRoute.snapshot.queryParams.collectionId
              : this.widgetData.identifier,
            ...data,
            // resourceId: data.resourceId,
            // dateAccessed: Date.now(),
            // data: JSON.stringify({
            //   progress: data.progress,
            //   timestamp: Date.now(),
            // }),
          }
          this.contentSvc
            .saveContinueLearning(continueLearningData)
            .toPromise()
            .catch()
        }
      }
    }
    const fireRProgress: fireRealTimeProgressFunction = (identifier, data) => {
        const collectionId = this.activatedRoute.snapshot.queryParams.collectionId ?
                this.activatedRoute.snapshot.queryParams.collectionId : this.widgetData.identifier
        const batchId = this.activatedRoute.snapshot.queryParams.batchId ?
                this.activatedRoute.snapshot.queryParams.batchId : this.widgetData.identifier

        if (this.widgetData.identifier && identifier && data) {
          this.viewerSvc
            .realTimeProgressUpdate(identifier, data, collectionId, batchId)
      }
    }
    let enableTelemetry = false
    if (!this.widgetData.disableTelemetry && typeof (this.widgetData.disableTelemetry) !== 'undefined') {
      enableTelemetry = true
    }
    const initObj = videoJsInitializer(
      this.videoTag.nativeElement,
      {
        ...videoJsOptions,
        poster: this.viewerSvc.getPublicUrl(this.widgetData.posterImage || ''),
        autoplay: this.widgetData.autoplay || false,
      },
      dispatcher,
      saveCLearning,
      fireRProgress,
      this.widgetData.passThroughData,
      ROOT_WIDGET_CONFIG.player.video,
      this.widgetData.resumePoint ? this.widgetData.resumePoint : 0,
      enableTelemetry,
      this.widgetData,
      this.widgetData.mimeType,
    )
    this.player = initObj.player
    this.dispose = initObj.dispose

    initObj.player.ready(() => {
      // Read saved subtitle preferences from localStorage before adding tracks
      const savedLanguage = localStorage.getItem(this.SUBTITLE_LANGUAGE_KEY)
      const savedEnabled = localStorage.getItem(this.SUBTITLE_ENABLED_KEY) === 'true'

      if (Array.isArray(this.widgetData.subtitles)) {
        this.widgetData.subtitles.forEach((u) => {
          initObj.player.addRemoteTextTrack(
            {
              // Never auto-enable via the 'default' flag — we apply the saved state
              // explicitly after tracks load to avoid browser-specific auto-enable behavior
              default: false,
              kind: 'captions',
              label: u.label,
              srclang: u.srclang,
              src: u.url,
            },
            false,
          )
        })
      }
      if (this.widgetData.url) {
        initObj.player.src(this.widgetData.url)
      }

      // Apply saved subtitle state once the media metadata (and tracks) are available.
      // Using 'loadedmetadata' ensures tracks are ready in all browsers including Safari.
      // Using 'on' (not 'one') so preferences are restored each time the source changes
      // when navigating between videos.
      initObj.player.on('loadedmetadata', () => {
        const tracks = initObj.player.textTracks()
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i]
          if (track.kind === 'captions' || track.kind === 'subtitles') {
            if (savedEnabled && savedLanguage && track.language &&
                track.language.toLowerCase() === savedLanguage.toLowerCase()) {
              track.mode = 'showing'
            } else {
              // Use 'hidden' instead of 'disabled' so the track data is still loaded
              // but not rendered — important for correct cue availability across browsers
              track.mode = 'hidden'
            }
          }
        }
      })

      // Persist subtitle state whenever the user changes it.
      // Guard ensures only one listener is attached even across video changes.
      if (!this.textTrackChangeListenerAdded) {
        this.textTrackChangeListenerAdded = true
        initObj.player.on('texttrackchange', () => {
          const tracks = initObj.player.textTracks()
          let activeTrack: videoJs.TextTrack | null = null
          for (let i = 0; i < tracks.length; i++) {
            if (
              (tracks[i].kind === 'captions' || tracks[i].kind === 'subtitles') &&
              tracks[i].mode === 'showing'
            ) {
              activeTrack = tracks[i]
              break
            }
          }
          if (activeTrack && activeTrack.language) {
            // Save language and enabled state so the next load or refresh restores them
            localStorage.setItem(this.SUBTITLE_LANGUAGE_KEY, activeTrack.language.toLowerCase())
            localStorage.setItem(this.SUBTITLE_ENABLED_KEY, 'true')
          } else {
            // Mark as disabled but keep the saved language so it can be re-enabled later
            localStorage.setItem(this.SUBTITLE_ENABLED_KEY, 'false')
          }
        })
      }
    })
  }
  async fetchContent() {
    const content = await this.contentSvc
      .fetchContent(this.widgetData.identifier || '', 'minimal')
      .toPromise()
    if (content.artifactUrl && content.artifactUrl.indexOf('/content-store/') > -1) {
      this.widgetData.url = content.artifactUrl
      this.widgetData.posterImage = content.appIcon
      this.widgetData.posterImage = this.viewerSvc.getPublicUrl(this.widgetData.posterImage || '')
      await this.contentSvc.setS3Cookie(this.widgetData.identifier || '').toPromise()
    }

    this.widgetData.subtitles = content.subTitles
  }
}
