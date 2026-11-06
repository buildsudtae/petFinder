import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Pet, type Report, type Species } from '../api/endpoints'
import { AreaPicker } from '../components/AreaPicker'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { CheckIcon } from '../components/Icons'
import { PetPhoto } from '../components/PetPhoto'
import { type Area, districtFeature, inDistrict } from '../lib/bkkMap'
import { DISTRICTS, SPECIES_TH } from '../lib/labels'
import { dateTimeTh, toLocalInput } from '../lib/time'
import { useFormError } from '../lib/useFormError'

const NEW_PET = '__new__'
const STEP_FIELDS: Record<1 | 2, string[]> = {
  1: ['pet_id', 'name', 'species', 'color', 'marks', 'photo'],
  2: ['last_seen_at', 'district', 'area_note', 'description'],
}
const FIELDS = [...STEP_FIELDS[1], ...STEP_FIELDS[2]]
const DRAFT = 'pettech.draft.report'
const STEPS = ['สัตว์ตัวไหน', 'หายที่ไหน เมื่อไหร่', 'ตรวจก่อนประกาศ']

interface Draft {
  petId: string; name: string; species: Species; color: string; marks: string
  lastSeen: string; district: string; areaNote: string; description: string; area: Area | null
}

function readDraft(): Partial<Draft> {
  try {
    const raw = sessionStorage.getItem(DRAFT)
    sessionStorage.removeItem(DRAFT)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** แจ้งสัตว์หาย 3 ขั้น (D9) — ตรวจข้อมูลก่อนไปขั้นถัดไป · 401 กลางทาง = เก็บทุกขั้นไว้แล้วกลับมาเติมหลัง login */
export function NewReport() {
  const navigate = useNavigate()
  const [d] = useState(readDraft)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [pets, setPets] = useState<Pet[] | null>(null)
  const [petId, setPetId] = useState(d.petId ?? '')
  const [name, setName] = useState(d.name ?? '')
  const [species, setSpecies] = useState<Species>(d.species ?? 'dog')
  const [color, setColor] = useState(d.color ?? '')
  const [marks, setMarks] = useState(d.marks ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [lastSeen, setLastSeen] = useState(d.lastSeen ?? toLocalInput(new Date(Date.now() - 3600_000)))
  const [district, setDistrict] = useState(d.district ?? '')
  const [areaNote, setAreaNote] = useState(d.areaNote ?? '')
  const [area, setArea] = useState<Area | null>(d.area ?? null)
  const [description, setDescription] = useState(d.description ?? '')
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [createdPet, setCreatedPet] = useState<Pet | null>(null)   // กัน retry แล้วสร้างสัตว์ซ้ำเมื่อขั้นถัดไปล้มเหลว
  const [done, setDone] = useState<Report | null>(null)
  const { error, setError, bannerError, fieldMessage } = useFormError(FIELDS)

  useEffect(() => {
    api.pets().then(
      (list) => { setPets(list); setPetId((cur) => cur || (list[0]?.id ?? NEW_PET)) },
      (e) => { setError(e); setPets([]); setPetId(NEW_PET) })
  }, [setError])

  const preview = useMemo(
    () => (photo && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const addingPet = petId === NEW_PET
  const chosen = pets?.find((p) => p.id === petId) ?? null
  const petName = addingPet ? name : chosen?.name ?? ''
  const msg = (f: string) => stepErrors[f] ?? fieldMessage(f)
  // เปลี่ยนเขตแล้วบริเวณเดิมไม่อยู่ในเขตใหม่ = ล้างทิ้ง ไม่ให้วงกลมอยู่นอกเขตที่ประกาศ
  function changeDistrict(v: string) {
    setDistrict(v)
    const f = districtFeature(v)
    if (area && (!f || !inDistrict(f, area[0], area[1]))) setArea(null)
  }

  function validate(s: 1 | 2): boolean {
    const errs: Record<string, string> = {}
    if (s === 1 && addingPet && !name.trim()) errs.name = 'ใส่ชื่อสัตว์เลี้ยง'
    if (s === 2) {
      if (!district.trim()) errs.district = 'เลือกเขตที่หาย'
      if (!lastSeen) errs.last_seen_at = 'ใส่วันเวลาที่เห็นครั้งสุดท้าย'
      else if (new Date(lastSeen).getTime() > Date.now()) errs.last_seen_at = 'เวลาที่เห็นครั้งสุดท้ายต้องไม่เป็นเวลาในอนาคต'
    }
    setStepErrors(errs)
    const first = Object.keys(errs)[0]
    if (first) setTimeout(() => document.getElementById(first)?.focus())
    return !first
  }

  function next() {
    setError(null)
    if (step < 3 && validate(step as 1 | 2)) setStep((step + 1) as 2 | 3)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      let pet = createdPet ?? chosen
      if (addingPet && !createdPet) {
        pet = await api.createPet({ name, species, color: color || null, marks: marks || null })
        setCreatedPet(pet)
      }
      if (!pet) throw new Error('no pet')
      if (photo) {
        await api.setPetPhoto(pet.id, photo)
        setPhoto(null)
      }
      const report = await api.createReport({
        pet_id: pet.id,
        last_seen_at: new Date(lastSeen).toISOString(),
        district: district.trim(),
        area_note: areaNote || null,
        description: description || null,
        area_lat: area?.[0] ?? null,
        area_lng: area?.[1] ?? null,
      })
      setDone(report)
    } catch (caught) {
      const err = caught as ApiError
      if (err.code === 'AUTH_REQUIRED') {
        try {
          const draft: Draft = { petId: createdPet ? createdPet.id : petId, name, species, color, marks, lastSeen, district, areaNote, description, area }
          sessionStorage.setItem(DRAFT, JSON.stringify(draft))
        } catch { /* storage ถูกบล็อก */ }
        navigate('/login', { state: { from: '/reports/new' } })
        return
      }
      if (err.field && STEP_FIELDS[1].includes(err.field)) setStep(1)
      else if (err.field && STEP_FIELDS[2].includes(err.field)) setStep(2)
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <section className="stack form-page" role="status">
        <span style={{ color: 'var(--found)' }}><CheckIcon size={40} /></span>
        <h1 style={{ fontSize: '1.875rem' }}>ประกาศ{done.pet_name}ขึ้นแล้ว</h1>
        <p className="meta">ประกาศอยู่ในรายการตามหาของเขต{done.district}แล้ว เมื่อมีคนส่งเบาะแส สถานะจะเปลี่ยนเป็น "มีเบาะแส" และตัวเลขใน "ประกาศของฉัน" จะขึ้น</p>
        <div className="row">
          <Link to={`/reports/${done.id}`} className="btn btn-brand">ดูประกาศ</Link>
          <Link to="/me/reports" className="btn btn-line">ประกาศของฉัน</Link>
        </div>
      </section>
    )
  }
  if (pets === null) return <p className="loading" role="status">กำลังโหลด…</p>

  return (
    <section className="stack form-page">
      <Link to="/" className="back">← ยกเลิก</Link>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '1.875rem' }}>แจ้งสัตว์หาย</h1>
        <span className="caption mono">ขั้น {step} จาก 3</span>
      </div>
      <ol className="stepper" aria-label="ขั้นตอน">
        {STEPS.map((s, i) => (
          <li key={s} className={i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''} aria-current={i + 1 === step ? 'step' : undefined}>{s}</li>
        ))}
      </ol>
      <ErrorBanner error={bannerError} />

      {step === 1 && (
        <div className="stack">
          <h2>{STEPS[0]}</h2>
          <div className="stack" role="group" aria-label="เลือกสัตว์เลี้ยง" style={{ gap: 8 }}>
            {pets.map((p) => (
              <button key={p.id} type="button" className="pet-opt" aria-pressed={petId === p.id} onClick={() => setPetId(p.id)}>
                <PetPhoto url={p.photo_url} species={p.species} alt={`รูป${p.name}`} className="pet-thumb" />
                <span><strong>{p.name}</strong><br /><span className="meta">{[SPECIES_TH[p.species], p.color, p.marks].filter(Boolean).join(' · ')}</span></span>
              </button>
            ))}
            <button type="button" className="pet-opt" aria-pressed={addingPet} onClick={() => setPetId(NEW_PET)}>
              <span className="pet-thumb" aria-hidden="true">+</span><strong>เพิ่มสัตว์ตัวใหม่</strong>
            </button>
          </div>

          {addingPet && (
            <>
              <Field id="name" label="ชื่อ" error={msg('name')}>
                <input value={createdPet?.name ?? name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={!!createdPet} />
              </Field>
              <div className="field">
                <span style={{ fontWeight: 600, fontSize: '0.9375rem' }} id="species-l">ชนิด</span>
                <div className="seg" role="group" aria-labelledby="species-l">
                  {Object.entries(SPECIES_TH).map(([k, v]) => (
                    <button key={k} type="button" aria-pressed={species === k} disabled={!!createdPet} onClick={() => setSpecies(k as Species)}>{v}</button>
                  ))}
                </div>
              </div>
              <Field id="color" label="สีและลักษณะ (ไม่บังคับ)" error={msg('color')}>
                <input value={color} onChange={(e) => setColor(e.target.value)} maxLength={80} disabled={!!createdPet} />
              </Field>
              <Field id="marks" label="จุดสังเกต (ไม่บังคับ)" error={msg('marks')} hint="สิ่งที่ทำให้คนแยกตัวนี้จากตัวอื่นได้ เช่น ปลอกคอ รอยแผล หางด้วน">
                <textarea value={marks} onChange={(e) => setMarks(e.target.value)} maxLength={500} rows={2} disabled={!!createdPet} />
              </Field>
            </>
          )}

          <Field id="photo" label={addingPet || !chosen?.photo_url ? 'รูปที่เห็นหน้าชัด (แนะนำ)' : 'เปลี่ยนรูป (ไม่บังคับ)'} error={msg('photo')}
                 hint="PNG, JPEG หรือ WebP ไม่เกิน 5 MB · ระบบลบตำแหน่งที่ฝังในรูปออกก่อนเก็บ">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </Field>
          {photo && preview && (
            <div className="drop"><img src={preview} alt="รูปที่เลือกไว้" /><span className="meta ellipsis">{photo.name}</span></div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <h2>{STEPS[1]}</h2>
          <Field id="district" label="เขต" error={msg('district')} hint="เลือกจาก 50 เขต กทม.">
            <input value={district} onChange={(e) => changeDistrict(e.target.value)} list="districts" autoComplete="off" aria-required="true" />
          </Field>
          <datalist id="districts">{DISTRICTS.map((x) => <option key={x} value={x} />)}</datalist>
          <Field id="area_note" label="จุดสังเกต (ไม่บังคับ)" error={msg('area_note')} hint="ชื่อซอยหรือจุดสังเกต ไม่ต้องบอกบ้านเลขที่">
            <input value={areaNote} onChange={(e) => setAreaNote(e.target.value)} maxLength={200} />
          </Field>
          <div className="field">
            <p className="field-label" id="area-label">บริเวณที่หายบนแผนที่ (ไม่บังคับ)</p>
            <p className="hint">ช่วยให้คนแถวนั้นรู้ว่าควรหาตรงไหน ระบบเก็บแบบหยาบราว 100 ม. แสดงเป็นวงกลม และลบทิ้งเมื่อปิดประกาศว่าพบแล้ว · ไม่ควรปักตรงหน้าบ้านพอดี</p>
            <AreaPicker district={district} value={area} onChange={setArea} />
          </div>
          <Field id="last_seen_at" label="เห็นครั้งสุดท้าย" error={msg('last_seen_at')}>
            <input type="datetime-local" value={lastSeen} max={toLocalInput(new Date())} onChange={(e) => setLastSeen(e.target.value)} />
          </Field>
          <Field id="description" label="ข้อความถึงคนที่เห็น (ไม่บังคับ)" error={msg('description')}
                 hint="เช่น ขี้กลัว ไม่ต้องไล่จับ · อย่าใส่เบอร์โทร ไลน์ หรือบ้านเลขที่ ข้อความนี้ทุกคนเห็นได้">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} />
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <h2>{STEPS[2]}</h2>
          <div className="card row" style={{ flexWrap: 'nowrap' }}>
            {preview ? <img src={preview} alt="" className="pet-thumb" /> :
              <PetPhoto url={chosen?.photo_url} species={addingPet ? species : chosen?.species ?? 'other'} alt={`รูป${petName}`} className="pet-thumb" />}
            <div>
              <p><strong>{petName}</strong> · {SPECIES_TH[addingPet ? species : chosen?.species ?? 'other']}</p>
              <p className="meta">หายที่{district}{areaNote ? ` ${areaNote}` : ''} · {lastSeen ? dateTimeTh(new Date(lastSeen).toISOString()) : ''}</p>
              {area && <p className="meta">ปักบริเวณที่หายไว้ คนอื่นเห็นเป็นวงกลมรัศมีราว 150 ม.</p>}
            </div>
          </div>
          <p className="meta">ประกาศแสดงต่อสาธารณะ: ชื่อ ชนิด รูป เขต จุดสังเกต บริเวณโดยประมาณ (ถ้าปัก) และข้อความถึงคนที่เห็น — ไม่แสดงชื่อหรือข้อมูลติดต่อของคุณ</p>
          {error && <p className="meta">แก้แล้วกดประกาศอีกครั้งได้ ระบบจะไม่สร้างสัตว์ซ้ำ</p>}
        </div>
      )}

      <div className="form-actions">
        {step > 1 ? <button type="button" className="btn btn-line" onClick={() => setStep((step - 1) as 1 | 2)}>ย้อนกลับ</button> : <span />}
        {step < 3
          ? <button type="button" className="btn btn-brand" onClick={next}>ถัดไป</button>
          : <button type="button" className="btn btn-brand" disabled={busy} onClick={submit}>{busy ? 'กำลังประกาศ…' : 'ประกาศตามหา'}</button>}
      </div>
    </section>
  )
}
