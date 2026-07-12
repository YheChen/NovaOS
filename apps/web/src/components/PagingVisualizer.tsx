import { useEffect, useMemo, useRef, useState } from 'react';
import { processId, createSimulationClock } from '@novaos/shared';
import {
  createMmu,
  asVirtualAddress,
  type Mmu,
  type MmuConfig,
  type MmuSnapshot,
  type AccessKind,
  type ReplacementPolicyId,
  type TlbEvictionId,
} from '@novaos/mmu';

const PID = processId(1);
const PAGE_SIZES = [16, 64, 256];

interface Config {
  pageSize: number;
  replacementId: ReplacementPolicyId;
  tlbEnabled: boolean;
  tlbCapacity: number;
  tlbEviction: TlbEvictionId;
  seed: number;
}

/** Derive a small, always-valid geometry: 16 virtual pages, 4 physical frames. */
function toMmuConfig(c: Config): MmuConfig {
  const offset = Math.round(Math.log2(c.pageSize));
  return {
    address: {
      pageSizeBytes: c.pageSize,
      virtualAddressBits: offset + 4, // 16 pages
      physicalAddressBits: offset + 2, // 4 frames
    },
    replacementId: c.replacementId,
    tlb: { enabled: c.tlbEnabled, capacity: c.tlbCapacity, evictionId: c.tlbEviction },
    seed: c.seed,
  };
}

const rwx = (p: { read: boolean; write: boolean; execute: boolean }): string =>
  `${p.read ? 'R' : '-'}${p.write ? 'W' : '-'}${p.execute ? 'X' : '-'}`;

export function PagingVisualizer() {
  const [config, setConfig] = useState<Config>({
    pageSize: 16,
    replacementId: 'fifo',
    tlbEnabled: true,
    tlbCapacity: 4,
    tlbEviction: 'lru',
    seed: 1,
  });
  const [addr, setAddr] = useState('0x1A');
  const [kind, setKind] = useState<AccessKind>('read');
  const [snapshot, setSnapshot] = useState<MmuSnapshot | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const mmuRef = useRef<Mmu | null>(null);

  const mmuConfig = useMemo(() => toMmuConfig(config), [config]);

  // Rebuild the MMU whenever the configuration changes (also the Reset action).
  useEffect(() => {
    const built = createMmu(mmuConfig, { clock: createSimulationClock() });
    if (!built.ok) {
      mmuRef.current = null;
      setStatus({ ok: false, text: built.error.message });
      setSnapshot(null);
      return;
    }
    built.value.addressSpace(PID);
    mmuRef.current = built.value;
    setSnapshot(built.value.snapshot());
    setStatus(null);
  }, [mmuConfig]);

  const translate = () => {
    const mmu = mmuRef.current;
    if (!mmu) return;
    const parsed = addr.trim().toLowerCase().startsWith('0x')
      ? parseInt(addr.trim(), 16)
      : Number(addr.trim());
    if (!Number.isFinite(parsed)) {
      setStatus({ ok: false, text: `Not a number: ${addr}` });
      return;
    }
    const result = mmu.translate({ pid: PID, address: asVirtualAddress(parsed), kind });
    if (result.ok) {
      const { virtualAddress, physicalAddress } = result.value.trace;
      setStatus({
        ok: true,
        text: `VA 0x${virtualAddress.toString(16)} → PA 0x${(physicalAddress ?? 0).toString(16)}`,
      });
    } else {
      setStatus({ ok: false, text: result.error.message });
    }
    setSnapshot(mmu.snapshot());
  };

  const set = <K extends keyof Config>(key: K, value: Config[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const pageTable = snapshot?.pageTables[0];
  const frames = snapshot?.frames.frames ?? [];
  const tlb = snapshot?.tlb;
  const trace = snapshot?.lastTranslation;

  return (
    <div className="conc-lab" data-testid="paging-lab">
      <div className="panel-title">Virtual memory lab · translate an address, watch it page</div>
      <div className="panel-body">
        <p className="muted" style={{ marginTop: 0 }}>
          A standalone MMU with its own {frames.length} physical frames. Translate a virtual address
          to walk VA → VPN + offset → page table → (fault?) → frame → physical address. Demand
          paging with {config.replacementId === 'clock' ? 'Clock (second-chance)' : 'FIFO'}{' '}
          replacement; fully deterministic (seed {config.seed}).
        </p>

        <div className="conc-controls">
          <label>
            page size
            <select
              className="gallery"
              value={config.pageSize}
              data-testid="mmu-pagesize"
              aria-label="Page size in bytes"
              onChange={(e) => set('pageSize', Number(e.target.value))}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} B
                </option>
              ))}
            </select>
          </label>
          <label>
            replacement
            <button
              className={config.replacementId === 'fifo' ? 'primary' : undefined}
              data-testid="mmu-policy"
              aria-pressed={config.replacementId === 'fifo'}
              onClick={() =>
                set('replacementId', config.replacementId === 'fifo' ? 'clock' : 'fifo')
              }
            >
              {config.replacementId === 'fifo' ? 'FIFO' : 'Clock'}
            </button>
          </label>
          <label>
            <input
              type="checkbox"
              checked={config.tlbEnabled}
              aria-label="Enable TLB"
              onChange={(e) => set('tlbEnabled', e.target.checked)}
            />
            TLB{' '}
            {config.tlbEnabled
              ? `(${config.tlbEviction.toUpperCase()}, cap ${config.tlbCapacity})`
              : 'off'}
          </label>
          <label>
            seed
            <input
              type="number"
              value={config.seed}
              className="seed-input"
              aria-label="Random seed"
              onChange={(e) => set('seed', Number(e.target.value) || 0)}
            />
          </label>
        </div>

        <div className="conc-controls">
          <label>
            virtual address
            <input
              type="text"
              value={addr}
              className="seed-input"
              data-testid="mmu-address"
              aria-label="Virtual address to translate"
              onChange={(e) => setAddr(e.target.value)}
            />
          </label>
          <label>
            access
            <select
              className="gallery"
              value={kind}
              aria-label="Access kind"
              onChange={(e) => setKind(e.target.value as AccessKind)}
            >
              <option value="read">read</option>
              <option value="write">write</option>
              <option value="execute">execute</option>
            </select>
          </label>
          <button className="primary" data-testid="mmu-translate" onClick={translate}>
            Translate
          </button>
        </div>

        {status && (
          <div
            className="terminal"
            style={{ color: status.ok ? 'var(--green)' : 'var(--red)', minHeight: 'auto' }}
            data-testid="mmu-status"
          >
            {status.text}
          </div>
        )}

        <div className="race-grid">
          <div className="race-card" data-testid="mmu-page-table">
            <div className="race-card-head">
              <span>Page table (PID 1)</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>VPN</th>
                  <th>present</th>
                  <th>frame</th>
                  <th>perms</th>
                  <th>D</th>
                  <th>Ref</th>
                </tr>
              </thead>
              <tbody>
                {(pageTable?.entries ?? []).map((e) => (
                  <tr
                    key={Number(e.vpn)}
                    className={trace && trace.vpn === Number(e.vpn) ? 'hl' : undefined}
                  >
                    <td>{Number(e.vpn)}</td>
                    <td>
                      {e.present ? (
                        <span className="statebadge loaded">yes</span>
                      ) : (
                        <span className="muted">no</span>
                      )}
                    </td>
                    <td>{e.frame === null ? '—' : Number(e.frame)}</td>
                    <td className="mono">{rwx(e.permissions)}</td>
                    <td>{e.dirty ? 'D' : '·'}</td>
                    <td>{e.referenced ? '•' : '·'}</td>
                  </tr>
                ))}
                {(pageTable?.entries.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      no pages touched yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="race-card" data-testid="mmu-frames">
            <div className="race-card-head">
              <span>Physical frames</span>
            </div>
            <div className="heap-bar">
              {frames.map((f) => (
                <div
                  key={Number(f.index)}
                  className={`heap-block ${f.occupant ? 'used' : 'free'}`}
                  style={{ flex: 1 }}
                  title={
                    f.occupant
                      ? `frame ${Number(f.index)}: P${Number(f.occupant.pid)}:V${Number(f.occupant.vpn)}`
                      : `frame ${Number(f.index)}: free`
                  }
                />
              ))}
            </div>
            <table>
              <tbody>
                {frames.map((f) => (
                  <tr key={Number(f.index)}>
                    <td>frame {Number(f.index)}</td>
                    <td className="muted">
                      {f.occupant
                        ? `PID ${Number(f.occupant.pid)}, VPN ${Number(f.occupant.vpn)}`
                        : 'free'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="race-card"
            data-testid="mmu-tlb"
            style={{ opacity: tlb?.enabled ? 1 : 0.5 }}
          >
            <div className="race-card-head">
              <span>TLB</span>
              {tlb && (
                <span className="muted mono">
                  {tlb.stats.hits}h / {tlb.stats.misses}m / {tlb.stats.evictions}e
                </span>
              )}
            </div>
            {tlb?.enabled ? (
              <table>
                <thead>
                  <tr>
                    <th>PID</th>
                    <th>VPN</th>
                    <th>frame</th>
                    <th>ins@</th>
                  </tr>
                </thead>
                <tbody>
                  {tlb.entries.map((e, i) => (
                    <tr key={i}>
                      <td>{e.pid}</td>
                      <td>{Number(e.vpn)}</td>
                      <td>{Number(e.frame)}</td>
                      <td className="muted">{e.insertedAtTick}</td>
                    </tr>
                  ))}
                  {tlb.entries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        empty
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <p className="muted">TLB disabled — every access walks the page table.</p>
            )}
          </div>

          <div className="race-card" data-testid="mmu-walkthrough">
            <div className="race-card-head">
              <span>Translation walkthrough</span>
            </div>
            {trace ? (
              <ol className="mmu-steps">
                {trace.steps.map((s, i) => (
                  <li key={i}>
                    <span className="statebadge">{s.stage}</span> {s.label}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Press Translate to walk an address.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
