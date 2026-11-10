const storage = require('../../utils/assistant-storage')
const { openAssistant } = require('../../utils/assistant-navigation')

const size = 52
const margin = 10
const dragThreshold = 8
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

Component({
  data: { left: 0, top: 0, ready: false, tip: false, tipLeft: 0, tipTop: 0, active: false, dragging: false },
  lifetimes: {
    attached() {
      this.layout(storage.readPosition())
      this.setData({ active: true, tip: !storage.sawTip() })
      if (this.data.tip) {
        storage.markTip()
        this.tipTimer = setTimeout(() => this.dismissTip(), 6500)
      }
    },
    detached() { clearTimeout(this.tipTimer) }
  },
  pageLifetimes: {
    show() { this.layout(this.position); this.setData({ active: true }) },
    hide() { this.stopDrag(); this.dismissTip(); this.setData({ active: false }) },
    resize() { this.stopDrag(); this.layout(this.position) }
  },
  methods: {
    layout(position) {
      const { windowWidth, windowHeight, screenTop, safeArea } = wx.getWindowInfo()
      const safeBottom = safeArea && Number.isFinite(screenTop) ? Math.max(0, screenTop + windowHeight - safeArea.bottom) : 0
      this.bounds = {
        minX: Math.max(margin, safeArea?.left || 0),
        minY: margin,
        maxX: Math.max(margin, Math.min(windowWidth, safeArea?.right || windowWidth) - size - margin),
        maxY: Math.max(margin, windowHeight - size - margin - safeBottom)
      }
      this.width = windowWidth
      const valid = position && Number.isFinite(position.left) && Number.isFinite(position.top)
      this.place(valid ? position.left : this.bounds.maxX - 8, valid ? position.top : this.bounds.maxY - 68)
    },
    place(left, top) {
      const { minX, maxX, minY, maxY } = this.bounds
      left = Math.round(clamp(left, minX, Math.max(minX, maxX)))
      top = Math.round(clamp(top, minY, maxY))
      this.position = { left, top }
      this.setData({
        left, top, ready: true,
        tipLeft: clamp(left - 88, margin, Math.max(margin, this.width - 150)),
        tipTop: top >= 50 ? top - 40 : top + size + 6
      })
    },
    dismissTip() { clearTimeout(this.tipTimer); if (this.data.tip) this.setData({ tip: false }) },
    touchStart(e) {
      if (e.touches.length !== 1 || this.gesture) {
        if (this.gesture) this.gesture.multiple = true
        return
      }
      const touch = e.touches[0]
      this.gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, ...this.position, distance: 0 }
    },
    track(touch) {
      const gesture = this.gesture
      if (!gesture || !touch || gesture.multiple) return
      const dx = touch.clientX - gesture.x
      const dy = touch.clientY - gesture.y
      gesture.distance += Math.hypot(dx - (gesture.dx || 0), dy - (gesture.dy || 0))
      Object.assign(gesture, { dx, dy })
      if (gesture.distance < dragThreshold) return
      if (!this.data.dragging) this.setData({ dragging: true })
      this.dismissTip()
      this.place(gesture.left + dx, gesture.top + dy)
    },
    touchMove(e) {
      if (e.touches.length !== 1 && this.gesture) this.gesture.multiple = true
      this.track(e.touches.find(touch => touch.identifier === this.gesture?.id))
    },
    touchEnd(e) {
      const touch = e.changedTouches.find(touch => touch.identifier === this.gesture?.id)
      if (!touch) return
      this.track(touch)
      const tap = !this.gesture.multiple && this.gesture.distance < dragThreshold
      this.stopDrag()
      if (tap) this.open()
    },
    stopDrag() {
      if (this.gesture && this.gesture.distance >= dragThreshold) storage.savePosition(this.position)
      if (this.gesture) this.lastTouch = Date.now()
      this.gesture = null
      if (this.data.dragging) this.setData({ dragging: false })
    },
    tapBall() {
      if (!this.lastTouch || Date.now() - this.lastTouch > 450) this.open()
    },
    open() {
      this.dismissTip()
      openAssistant('map')
    }
  }
})
