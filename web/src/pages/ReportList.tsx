import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report } from '../api/endpoints'
import { MapIcon, OfflineIcon, SearchIcon } from '../components/Icons'
import { ReportCard } from '../components/ReportCard'
import { DISTRICTS_SORTED, SPECIES_TH } from '../lib/labels'

const PAGE = 12
const SPECIES = [['', 'ทั้งหมด'], ...Object.entries(SPECIES_TH)] as const

const FAQ: [string, string][] = [
  ['ต้องสมัครสมาชิกไหม', 'ดูประกาศได้โดยไม่ต้องเข้าสู่ระบบ ส่วนการลงประกาศและส่งเบาะแสต้องมีบัญชี เพราะระบบต้องรู้ว่าใครคุยกับใคร โดยไม่ต้องเปิดเบอร์ของทั้งสองฝั่ง'],
  ['คนที่เห็นจะรู้เบอร์โทรหรือที่อยู่ของฉันไหม', 'ไม่รู้ ระบบไม่มีช่องเก็บเบอร์ ที่อยู่ หรือไลน์ไอดีเลย สิ่งที่แสดงคือเขตและจุดสังเกตที่สัตว์หาย ไม่ใช่บ้านของคุณ ระบบลบตำแหน่งที่ฝังในรูปออกก่อนเก็บ อย่าพิมพ์เบอร์หรือบ้านเลขที่ลงในช่องข้อความเอง'],
  ['เจอสัตว์แล้วต้องทำอะไรต่อ', 'กดปิดประกาศ ประกาศจะขึ้นว่าพบแล้ว หลุดจากรายการตามหา และระบบไม่รับเบาะแสใหม่อีก ประวัติทั้งหมดยังเก็บไว้'],
  ['ปิดประกาศผิด เปิดใหม่ได้ไหม', 'ได้ ระบุเหตุผลสั้นๆ แล้วกดเปิดใหม่ ถ้ามีเบาะแสเดิมอยู่ สถานะจะกลับเป็นมีเบาะแส ไม่ใช่เริ่มจากศูนย์'],
  ['ส่งเบาะแสแล้วเน็ตหลุด ต้องส่งใหม่ไหม', 'กดส่งซ้ำจากหน้าเดิมได้เลย ระบบนับเป็นเบาะแสรายการเดียว เจ้าของจะไม่ได้รายการซ้ำ แต่ถ้าปิดหน้าแล้วเปิดส่งใหม่ ระบบจะนับเป็นเบาะแสใหม่'],
  ['ถ้าประกาศถูกปิดระหว่างที่ฉันพิมพ์ ข้อความจะหายไหม', 'ไม่หาย ระบบแจ้งว่าเจ้าของพบสัตว์แล้ว และข้อความที่คุณพิมพ์ยังอยู่ในช่องครบ'],
]

export function ReportList() {
  const [params, setParams] = useSearchParams()
  const { hash } = useLocation()
  const species = params.get('species') ?? ''
  const district = params.get('district') ?? ''
  const withFound = params.get('found') === '1'
  const [items, setItems] = useState<Report[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const load = useCallback(() => {
    setError(null)
    setItems(null)
    // ไม่ส่ง status = เฉพาะประกาศที่ยังเปิดอยู่ · include_resolved รวมที่พบแล้ว
    api.reportPage({ species, district, include_resolved: withFound, limit: PAGE })
      .then((p) => { setItems(p.items); setNext(p.next) }, (e) => { setError(e); setItems([]) })
  }, [species, district, withFound])

  useEffect(load, [load])

  useEffect(() => {
    if (hash && items !== null) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash, items])

  async function loadMore() {
    if (!next) return
    setLoadingMore(true)
    try {
      const p = await api.reportPage({ species, district, include_resolved: withFound, limit: PAGE, cursor: next })
      setItems((old) => [...(old ?? []), ...p.items])
      setNext(p.next)
    } catch (e) {
      setError(e as ApiError)
    } finally {
      setLoadingMore(false)
    }
  }

  function setFilter(name: string, value: string) {
    const nextParams = new URLSearchParams(params)
    if (value) nextParams.set(name, value)
    else nextParams.delete(name)
    setParams(nextParams)
  }

  const filtered = !!(species || district)
  const offline = error?.code === 'NETWORK'

  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className="list-head">
        <div className="stack" style={{ gap: 4, maxWidth: 680 }}>
          <h1>ประกาศที่ยังตามหา</h1>
          <p className="meta" role="status">
            {items === null ? 'กำลังโหลด…' : <><span className="mono" style={{ fontWeight: 600, color: 'var(--ink)' }}>{items.length}</span> ประกาศที่แสดงอยู่ · ประกาศล่าสุดก่อน</>}
          </p>
        </div>
        <Link to="/map" className="btn btn-line"><MapIcon />ดูบนแผนที่</Link>
      </div>

      <div className="filters" role="group" aria-label="ตัวกรองประกาศ">
        <div className="seg" role="group" aria-label="ชนิดสัตว์">
          {SPECIES.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={species === v} onClick={() => setFilter('species', v)}>{label}</button>
          ))}
        </div>
        <label htmlFor="f-district" className="visually-hidden">เขต</label>
        <select id="f-district" className="select" value={district} onChange={(e) => setFilter('district', e.target.value)}>
          <option value="">ทุกเขต</option>
          {DISTRICTS_SORTED.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={withFound} onChange={(e) => setFilter('found', e.target.checked ? '1' : '')} />
          รวมที่พบแล้ว
        </label>
      </div>

      {error && !loadingMore && (
        <div role="alert" className="empty" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
          {offline && <span style={{ color: 'var(--alert)' }}><OfflineIcon /></span>}
          <h2>{offline ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' : 'โหลดประกาศไม่สำเร็จ'}</h2>
          <p className="meta">{error.messageTh}</p>
          <button type="button" className="btn btn-brand" onClick={load}>ลองอีกครั้ง</button>
        </div>
      )}

      {items === null && (
        <ul className="rgrid" aria-busy="true" aria-label="กำลังโหลดประกาศ">
          {[0, 1, 2, 3].map((i) => <li key={i} className={i === 0 ? 'feat-li' : undefined}><div className="skeleton" style={{ height: 380 }} /></li>)}
        </ul>
      )}

      {items && items.length === 0 && !error && (
        <div className="empty">
          <SearchIcon size={32} />
          <h2>ไม่มีประกาศที่ตรงกับตัวกรองนี้</h2>
          <p className="meta">{district ? `ยังไม่มีใครประกาศตามหาในเขต${district}` : 'ยังไม่มีประกาศที่ตรงกับตัวกรอง'} ลองเลือกทุกเขตดูอีกครั้ง</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {filtered && <button type="button" className="btn btn-brand" onClick={() => setParams({})}>ล้างตัวกรอง</button>}
            <Link to="/reports/new" className="btn btn-line">แจ้งสัตว์หาย</Link>
          </div>
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <ul className="rgrid">
            {items.map((r, i) => <ReportCard key={r.id} report={r} featured={i === 0 && items.length > 2} />)}
          </ul>
          <div className="more">
            {next && (
              <button type="button" className="btn btn-line" onClick={loadMore} disabled={loadingMore} aria-busy={loadingMore}>
                {loadingMore ? 'กำลังโหลด…' : 'ดูเพิ่ม'}
              </button>
            )}
            {!next && <p className="caption" role="status">แสดงครบทุกประกาศแล้ว</p>}
          </div>
        </>
      )}

      <section id="how" aria-labelledby="how-h" className="stack" style={{ paddingTop: 96 }}>
        <div className="stack" style={{ gap: 8, maxWidth: 680 }}>
          <span className="eyebrow">วิธีใช้งาน</span>
          <h2 id="how-h" style={{ fontSize: '2.25rem' }}>สัตว์ของคุณหาย<br />ประกาศได้ในสามขั้น</h2>
          <p className="meta">ลงประกาศฟรี ไม่ต้องเปิดเบอร์โทร คนที่เห็นส่งเบาะแสและคุยกับคุณในระบบ</p>
        </div>
        <ol className="how">
          <li className="how-card"><span className="how-n">01</span><h3>ลงประกาศ</h3><p className="meta">ชื่อ ลักษณะ รูป เขตที่หาย และเวลาที่เห็นครั้งสุดท้าย</p></li>
          <li className="how-card"><span className="how-n">02</span><h3>รับเบาะแส</h3><p className="meta">คนที่เห็นบอกบริเวณและเวลา สถานะเปลี่ยนเป็นมีเบาะแสให้เอง</p></li>
          <li className="how-card"><span className="how-n">03</span><h3>คุยแล้วปิดประกาศ</h3><p className="meta">นัดรับในกล่องข้อความ เจอแล้วกดปิด ระบบหยุดรับเบาะแสใหม่</p></li>
        </ol>
        <Link to="/reports/new" className="btn btn-brand" style={{ alignSelf: 'flex-start' }}>แจ้งสัตว์หาย</Link>
      </section>

      <section id="faq" aria-labelledby="faq-h" className="stack" style={{ paddingTop: 96 }}>
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">คำถามที่พบบ่อย</span>
          <h2 id="faq-h" style={{ fontSize: '2.25rem' }}>ก่อนเริ่มประกาศ</h2>
        </div>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
