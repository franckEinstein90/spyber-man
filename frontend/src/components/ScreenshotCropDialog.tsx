import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Dialog } from "radix-ui"
import { Hand } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PixelCrop } from "@/lib/agent"

type DragMode = "move" | "draw" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

interface NaturalSize {
  width: number
  height: number
}

const MIN_CROP = 16
const MIN_ZOOM = 0.25
const MAX_ZOOM = 8

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function hitMode(localX: number, localY: number, width: number, height: number): DragMode {
  const edge = 12
  const nearL = localX <= edge
  const nearR = width - localX <= edge
  const nearT = localY <= edge
  const nearB = height - localY <= edge
  if (nearT && nearL) return "nw"
  if (nearT && nearR) return "ne"
  if (nearB && nearL) return "sw"
  if (nearB && nearR) return "se"
  if (nearT) return "n"
  if (nearB) return "s"
  if (nearL) return "w"
  if (nearR) return "e"
  return "move"
}

function cursorFor(mode: DragMode): string {
  if (mode === "n" || mode === "s") return "ns-resize"
  if (mode === "e" || mode === "w") return "ew-resize"
  if (mode === "ne" || mode === "sw") return "nesw-resize"
  if (mode === "nw" || mode === "se") return "nwse-resize"
  if (mode === "draw") return "crosshair"
  return "move"
}

function applyDrag(
  start: PixelCrop,
  dx: number,
  dy: number,
  mode: DragMode,
  bounds: NaturalSize,
  anchor?: { x: number; y: number },
): PixelCrop {
  const min = Math.min(MIN_CROP, bounds.width, bounds.height)
  if (mode === "draw" && anchor) {
    const x1 = Math.max(0, Math.min(anchor.x, anchor.x + dx))
    const y1 = Math.max(0, Math.min(anchor.y, anchor.y + dy))
    const x2 = Math.min(bounds.width, Math.max(anchor.x, anchor.x + dx))
    const y2 = Math.min(bounds.height, Math.max(anchor.y, anchor.y + dy))
    return { x: x1, y: y1, width: Math.max(x2 - x1, 0), height: Math.max(y2 - y1, 0) }
  }

  if (mode === "move") {
    const x = Math.min(Math.max(0, start.x + dx), Math.max(0, bounds.width - start.width))
    const y = Math.min(Math.max(0, start.y + dy), Math.max(0, bounds.height - start.height))
    return { x, y, width: start.width, height: start.height }
  }

  let x1 = start.x
  let y1 = start.y
  let x2 = start.x + start.width
  let y2 = start.y + start.height
  if (mode.includes("w")) x1 += dx
  if (mode.includes("e")) x2 += dx
  if (mode.includes("n")) y1 += dy
  if (mode.includes("s")) y2 += dy
  if (x2 < x1) [x1, x2] = [x2, x1]
  if (y2 < y1) [y1, y2] = [y2, y1]
  if (x2 - x1 < min) {
    if (mode.includes("w")) x1 = x2 - min
    else x2 = x1 + min
  }
  if (y2 - y1 < min) {
    if (mode.includes("n")) y1 = y2 - min
    else y2 = y1 + min
  }
  x1 = Math.max(0, x1)
  y1 = Math.max(0, y1)
  x2 = Math.min(bounds.width, x2)
  y2 = Math.min(bounds.height, y2)
  return { x: x1, y: y1, width: Math.max(min, x2 - x1), height: Math.max(min, y2 - y1) }
}

export function ScreenshotCropDialog({
  src,
  title,
  open,
  onClose,
  onParse,
}: {
  src: string
  title: string
  open: boolean
  onClose: () => void
  onParse: (crop: PixelCrop) => void
}) {
  const imageRef = useRef<HTMLImageElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  const pendingScroll = useRef<{ left: number; top: number } | null>(null)
  const panDrag = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [handMode, setHandMode] = useState(false)
  const [panning, setPanning] = useState(false)
  const [natural, setNatural] = useState<NaturalSize | null>(null)
  const [loadedSrc, setLoadedSrc] = useState("")
  const [displayWidth, setDisplayWidth] = useState(0)
  const [crop, setCrop] = useState<PixelCrop | null>(null)
  const cropRef = useRef<PixelCrop | null>(null)
  const [cursor, setCursor] = useState("crosshair")
  const dragRef = useRef<{
    mode: DragMode
    originX: number
    originY: number
    start: PixelCrop
    anchor?: { x: number; y: number }
  } | null>(null)

  const shown = loadedSrc === src ? natural : null
  const shownCrop = loadedSrc === src ? crop : null

  useEffect(() => {
    zoomRef.current = 1
    setZoom(1)
    setHandMode(false)
    setPanning(false)
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollLeft = 0
    viewport.scrollTop = 0
  }, [src, open])

  useEffect(() => {
    if (!open) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const viewport = viewportRef.current
      if (!viewport) return
      const current = zoomRef.current
      const next = clampZoom(current * Math.exp(-event.deltaY * 0.0015))
      if (next === current) return
      const rect = viewport.getBoundingClientRect()
      const offsetX = event.clientX - rect.left + viewport.scrollLeft
      const offsetY = event.clientY - rect.top + viewport.scrollTop
      const ratio = next / current
      pendingScroll.current = {
        left: offsetX * ratio - (event.clientX - rect.left),
        top: offsetY * ratio - (event.clientY - rect.top),
      }
      zoomRef.current = next
      setZoom(next)
    }
    document.addEventListener("wheel", onWheel, { capture: true, passive: false })
    return () => document.removeEventListener("wheel", onWheel, { capture: true })
  }, [open])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const pending = pendingScroll.current
    if (!viewport || !pending) return
    viewport.scrollLeft = pending.left
    viewport.scrollTop = pending.top
    pendingScroll.current = null
  }, [zoom])

  useEffect(() => {
    const image = imageRef.current
    if (!image || !natural) return
    const observer = new ResizeObserver(() => setDisplayWidth(image.clientWidth))
    observer.observe(image)
    setDisplayWidth(image.clientWidth)
    return () => observer.disconnect()
  }, [shown, src])

  function updateCrop(next: PixelCrop) {
    cropRef.current = next
    setCrop(next)
  }

  const scale = shown && displayWidth > 0 ? displayWidth / shown.width : 1

  function toNatural(event: { clientX: number; clientY: number }) {
    const image = imageRef.current
    if (!image || !shown) return { x: 0, y: 0 }
    const rect = image.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * shown.width
    const y = ((event.clientY - rect.top) / rect.height) * shown.height
    return {
      x: Math.min(Math.max(0, x), shown.width),
      y: Math.min(Math.max(0, y), shown.height),
    }
  }

  function startPan(event: React.PointerEvent<HTMLElement>) {
    const viewport = viewportRef.current
    if (!handMode || !viewport) return
    event.preventDefault()
    panDrag.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPanning(true)
  }

  function movePan(event: React.PointerEvent<HTMLElement>) {
    const drag = panDrag.current
    const viewport = viewportRef.current
    if (!drag || !viewport) return
    viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.x)
    viewport.scrollTop = drag.scrollTop - (event.clientY - drag.y)
  }

  function endPan() {
    if (!panDrag.current) return
    panDrag.current = null
    setPanning(false)
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (handMode) {
      event.stopPropagation()
      startPan(event)
      return
    }
    if (!shown || !shownCrop) return
    const point = toNatural(event)
    const localX = (point.x - shownCrop.x) * scale
    const localY = (point.y - shownCrop.y) * scale
    const inside =
      point.x >= shownCrop.x &&
      point.x <= shownCrop.x + shownCrop.width &&
      point.y >= shownCrop.y &&
      point.y <= shownCrop.y + shownCrop.height
    const coversImage = shownCrop.width >= shown.width - 1 && shownCrop.height >= shown.height - 1
    const mode: DragMode = !inside || coversImage ? "draw" : hitMode(localX, localY, shownCrop.width * scale, shownCrop.height * scale)
    dragRef.current = {
      mode,
      originX: point.x,
      originY: point.y,
      start: shownCrop,
      anchor: mode === "draw" ? point : undefined,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (panDrag.current) {
      movePan(event)
      return
    }
    if (handMode || !shown || !shownCrop) return
    const point = toNatural(event)
    const drag = dragRef.current
    if (!drag) {
      const localX = (point.x - shownCrop.x) * scale
      const localY = (point.y - shownCrop.y) * scale
      const inside =
        point.x >= shownCrop.x &&
        point.x <= shownCrop.x + shownCrop.width &&
        point.y >= shownCrop.y &&
        point.y <= shownCrop.y + shownCrop.height
      const coversImage = shownCrop.width >= shown.width - 1 && shownCrop.height >= shown.height - 1
      const mode = !inside || coversImage ? "draw" : hitMode(localX, localY, shownCrop.width * scale, shownCrop.height * scale)
      setCursor(cursorFor(mode))
      return
    }
    updateCrop(
      applyDrag(
        drag.start,
        point.x - drag.originX,
        point.y - drag.originY,
        drag.mode,
        shown,
        drag.anchor,
      ),
    )
  }

  function onPointerUp() {
    if (panDrag.current) {
      endPan()
      return
    }
    const drag = dragRef.current
    dragRef.current = null
    const latest = cropRef.current
    if (!drag || drag.mode !== "draw" || !latest) return
    if (latest.width < MIN_CROP || latest.height < MIN_CROP) updateCrop(drag.start)
  }

  const selection = shownCrop
    ? `${Math.round(shownCrop.width)} × ${Math.round(shownCrop.height)} px at ${Math.round(shownCrop.x)}, ${Math.round(shownCrop.y)}`
    : "Loading image"

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className="bg-background fixed top-[4vh] left-1/2 z-50 flex h-[92vh] w-[min(960px,calc(100%-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border shadow-lg outline-none">
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-sm font-medium">{title}</Dialog.Title>
              <Dialog.Description className="text-muted-foreground mt-1 text-xs">
                {shown ? `Image ${shown.width} × ${shown.height} px` : "Loading the screenshot"}
                {shown ? ` · ${Math.round(zoom * 100)}%` : ""}
                {shownCrop ? ` · Selection ${selection}` : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="sm">
                Close
              </Button>
            </Dialog.Close>
          </div>
          <div
            ref={viewportRef}
            className="min-h-0 flex-1 overflow-auto bg-muted/40"
            style={{ cursor: handMode ? (panning ? "grabbing" : "grab") : undefined }}
            onPointerDown={(event) => {
              if (handMode) startPan(event)
            }}
            onPointerMove={(event) => {
              if (panDrag.current) movePan(event)
            }}
            onPointerUp={endPan}
          >
            <div className="relative" style={{ width: `${zoom * 100}%` }}>
              <img
                ref={imageRef}
                src={src}
                alt={title}
                draggable={false}
                className="block h-auto w-full select-none"
                onLoad={(event) => {
                  const image = event.currentTarget
                  const size = { width: image.naturalWidth, height: image.naturalHeight }
                  setLoadedSrc(src)
                  setNatural(size)
                  updateCrop({ x: 0, y: 0, width: size.width, height: size.height })
                }}
              />
              {shownCrop && shown ? (
                <div
                  className="absolute inset-0 touch-none"
                  style={{ cursor: handMode ? (panning ? "grabbing" : "grab") : cursor }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  <div
                    className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                    style={{
                      left: shownCrop.x * scale,
                      top: shownCrop.y * scale,
                      width: Math.max(shownCrop.width * scale, 1),
                      height: Math.max(shownCrop.height * scale, 1),
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
            <p className="text-muted-foreground text-xs">
              Ctrl+scroll to zoom. Use the hand to pan. Drag to choose the region that gets parsed.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="icon"
                variant={handMode ? "secondary" : "outline"}
                aria-pressed={handMode}
                aria-label={handMode ? "Stop panning" : "Pan"}
                title="Pan"
                onClick={() => setHandMode((value) => !value)}
              >
                <Hand />
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!shown}
                onClick={() => {
                  if (!shown) return
                  updateCrop({ x: 0, y: 0, width: shown.width, height: shown.height })
                }}
              >
                Reset
              </Button>
              <Button
                type="button"
                disabled={!shownCrop || shownCrop.width < 1 || shownCrop.height < 1}
                onClick={() => {
                  if (!shownCrop) return
                  onParse({
                    x: Math.round(shownCrop.x),
                    y: Math.round(shownCrop.y),
                    width: Math.max(1, Math.round(shownCrop.width)),
                    height: Math.max(1, Math.round(shownCrop.height)),
                  })
                }}
              >
                Parse selection
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
