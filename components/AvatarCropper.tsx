"use client";

import { useEffect, useRef, useState } from "react";
import { clampOffset, coverScale, cropToSquare, naturalSize, type CropView } from "@/lib/avatar";

// Drag to move, slider to zoom, and the frame is a circle because that is the
// only shape the avatar is ever shown in. Everything on screen is measured in
// viewport pixels; lib/avatar turns that into a source-pixel crop.
export default function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const [url, setUrl] = useState("");
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<CropView>({ offsetX: 0, offsetY: 0, zoom: 1 });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // Fixed for the life of the sheet, since every offset in state is relative to
  // it. Read once rather than on resize: the keyboard is not involved here, and
  // a rotation mid-crop is not worth the re-anchoring it would need.
  const [viewport] = useState(() =>
    typeof window === "undefined" ? 288 : Math.min(288, window.innerWidth - 72),
  );

  // Created and revoked in the same effect on purpose. Holding the URL in a
  // state initializer instead leaves a revoked string behind the moment the
  // effect is torn down and re-run, and the preview then renders blank.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Start centred, at the smallest zoom that fills the circle.
  useEffect(() => {
    let alive = true;
    naturalSize(file)
      .then((size) => {
        if (!alive) return;
        const scale = coverScale(size, viewport);
        setNatural(size);
        setView({
          zoom: 1,
          offsetX: (viewport - size.width * scale) / 2,
          offsetY: (viewport - size.height * scale) / 2,
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [file, viewport]);

  function move(next: CropView) {
    if (!natural) return;
    setView({ ...next, ...clampOffset(natural, viewport, next) });
  }

  // Zoom about the centre of the frame, so the face you lined up stays put
  // instead of sliding toward the top-left corner.
  function zoomTo(zoom: number) {
    const k = zoom / view.zoom;
    move({
      zoom,
      offsetX: (view.offsetX - viewport / 2) * k + viewport / 2,
      offsetY: (view.offsetY - viewport / 2) * k + viewport / 2,
    });
  }

  async function confirm() {
    if (!natural) return;
    setBusy(true);
    setFailed(false);
    try {
      onDone(await cropToSquare(file, viewport, view));
    } catch {
      setBusy(false);
      setFailed(true);
    }
  }

  const scale = natural ? coverScale(natural, viewport) * view.zoom : 1;

  return (
    <div className="cr-backdrop" role="dialog" aria-modal="true" aria-label="Crop your photo">
      <div className="cr-sheet">
        <p className="cr-hint">Drag to move, pinch the slider to zoom.</p>

        <div
          className="cr-frame"
          style={{ width: viewport, height: viewport }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, ox: view.offsetX, oy: view.offsetY };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            move({ ...view, offsetX: d.ox + e.clientX - d.px, offsetY: d.oy + e.clientY - d.py });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {/* Hidden until the decode reports a size, since every offset here is
              derived from it. */}
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                // Tailwind's preflight caps images at max-width:100%, which
                // would clamp the width while the height below stays, and the
                // photo squashes.
                maxWidth: "none",
                opacity: natural ? 1 : 0,
                left: view.offsetX,
                top: view.offsetY,
                width: natural ? natural.width * scale : "auto",
                height: natural ? natural.height * scale : "auto",
              }}
            />
          )}
        </div>

        <input
          type="range"
          className="cr-zoom"
          min={1}
          max={4}
          step={0.01}
          value={view.zoom}
          aria-label="Zoom"
          disabled={!natural}
          onChange={(e) => zoomTo(Number(e.target.value))}
        />

        {failed && <p className="cr-failed">Couldn&apos;t crop that one. Try another photo.</p>}

        <div className="cr-actions">
          <button type="button" className="cr-cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="cr-use" onClick={confirm} disabled={!natural || busy}>
            {busy ? "Saving…" : "Use photo"}
          </button>
        </div>
      </div>

      <style>{`
        .cr-backdrop {
          position: fixed;
          inset: 0;
          z-index: 110;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(0, 0, 0, 0.72);
        }
        .cr-sheet {
          width: 100%;
          max-width: 340px;
          padding: 20px;
          border-radius: 20px;
          border: 1px solid var(--line);
          background: var(--surface, #101B27);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
        }
        .cr-hint {
          font-size: 13px;
          color: var(--ink-2);
          text-align: center;
          margin-bottom: 14px;
        }
        .cr-frame {
          position: relative;
          margin: 0 auto;
          border-radius: 50%;
          overflow: hidden;
          background: var(--bg);
          touch-action: none;
          cursor: grab;
          user-select: none;
        }
        .cr-frame:active { cursor: grabbing; }
        .cr-zoom {
          display: block;
          width: 100%;
          margin: 18px 0 4px;
          accent-color: var(--accent);
        }
        .cr-failed {
          font-size: 13px;
          color: var(--danger);
          text-align: center;
          margin-top: 8px;
        }
        .cr-actions {
          display: flex;
          gap: 12px;
          margin-top: 16px;
        }
        .cr-cancel {
          padding: 13px 20px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 600;
          border: 1px solid var(--line);
          color: var(--ink);
          background: none;
        }
        .cr-use {
          flex: 1;
          padding: 13px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          border: none;
          background: var(--accent-grad);
          color: var(--accent-ink);
        }
        .cr-use:disabled, .cr-cancel:disabled { opacity: 0.5; }
      `}</style>
    </div>
  );
}
