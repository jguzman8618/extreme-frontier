import { useState } from 'react';

export interface TradeSessionState {
  sessionId: string;
  otherId: string;
  otherUsername: string;
  offers: Record<string, Record<string, number>>;
  confirmed: Record<string, boolean>;
}

export function TradeInvitePrompt({
  fromUsername,
  onAccept,
  onDecline,
}: {
  fromUsername: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Trade offer</h3>
        <p className="modal-note">{fromUsername} wants to barter with you.</p>
        <button className="crop-option" onClick={onAccept}>Accept</button>
        <button className="cancel" onClick={onDecline}>Decline</button>
      </div>
    </div>
  );
}

export function TradeModal({
  session,
  myId,
  myInventory,
  onUpdateOffer,
  onConfirm,
  onCancel,
}: {
  session: TradeSessionState;
  myId: string;
  myInventory: Record<string, number>;
  onUpdateOffer: (items: Record<string, number>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, number>>(session.offers[myId] ?? {});

  const myOffer = session.offers[myId] ?? {};
  const theirOffer = session.offers[session.otherId] ?? {};
  const iConfirmed = session.confirmed[myId];
  const theyConfirmed = session.confirmed[session.otherId];

  function setQty(item: string, qty: number) {
    const clamped = Math.max(0, Math.min(qty, myInventory[item] ?? 0));
    const next = { ...draft, [item]: clamped };
    if (clamped === 0) delete next[item];
    setDraft(next);
  }

  function sendOffer() {
    onUpdateOffer(draft);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal trade-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Bartering with {session.otherUsername}</h3>

        <div className="trade-columns">
          <div className="trade-col">
            <h4>Your offer {iConfirmed && '✅'}</h4>
            {Object.entries(myInventory).filter(([, have]) => have > 0).length === 0 && <p className="modal-note">You have nothing to trade.</p>}
            {Object.entries(myInventory).filter(([, have]) => have > 0).map(([item, have]) => (
              <div key={item} className="trade-row">
                <span>{item} (have {have})</span>
                <input
                  type="number"
                  min={0}
                  max={have}
                  value={draft[item] ?? 0}
                  onChange={(e) => setQty(item, Number(e.target.value))}
                />
              </div>
            ))}
            <button className="crop-option" onClick={sendOffer}>Update offer</button>
            {Object.keys(myOffer).length > 0 && (
              <p className="modal-note">Currently offering: {Object.entries(myOffer).map(([i, q]) => `${q} ${i}`).join(', ')}</p>
            )}
          </div>

          <div className="trade-col">
            <h4>{session.otherUsername}'s offer {theyConfirmed && '✅'}</h4>
            {Object.keys(theirOffer).length === 0 && <p className="modal-note">Nothing offered yet.</p>}
            {Object.entries(theirOffer).map(([item, qty]) => (
              <div key={item} className="trade-row"><span>{qty} {item}</span></div>
            ))}
          </div>
        </div>

        <button className="sell-option" onClick={onConfirm} disabled={iConfirmed}>
          {iConfirmed ? 'Waiting for other side…' : 'Confirm trade'}
        </button>
        <button className="cancel" onClick={onCancel}>Cancel trade</button>
      </div>
    </div>
  );
}
