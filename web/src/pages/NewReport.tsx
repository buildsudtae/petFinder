import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Pet, type Species } from '../api/endpoints'
import { useAuth } from '../auth'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { DISTRICTS, SPECIES_TH } from '../lib/labels'
import { rememberReport } from '../lib/mine'
import { toLocalInput } from '../lib/time'
import { useFormError } from '../lib/useFormError'

const NEW_PET = '__new__'
const FIELDS = ['pet_id', 'name', 'species', 'color', 'marks', 'last_seen_at', 'district', 'area_note', 'description']

/** หน้าเดียว ไม่ทำ wizard: สัตว์ตัวไหน -> หายเมื่อไหร่ที่ไหน -> ลักษณะเด่น */
export function NewReport() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pets, setPets] = useState<Pet[] | null>(null)
  const [petId, setPetId] = useState('')
  const [name, setName] = useState('')
  const [species, setSpecies] = useState<Species>('cat')
  const [color, setColor] = useState('')
  const [marks, setMarks] = useState('')
  const [lastSeen, setLastSeen] = useState(() => toLocalInput(new Date(Date.now() - 3600_000)))
  const [district, setDistrict] = useState('')
  const [areaNote, setAreaNote] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [createdPet, setCreatedPet] = useState<Pet | null>(null)   // กัน retry แล้วสร้างสัตว์ซ้ำเมื่อ report ล้มเหลว
  const { setError, bannerError, fieldMessage } = useFormError(FIELDS)

  useEffect(() => {
    api.pets().then((list) => { setPets(list); setPetId(list[0]?.id ?? NEW_PET) }, (e) => { setError(e); setPets([]); setPetId(NEW_PET) })
  }, [setError])

  const addingPet = petId === NEW_PET

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      let pet = createdPet
      let id = petId
      if (addingPet) {
        if (!pet) {
          pet = await api.createPet({ name, species, color: color || null, marks: marks || null })
          setCreatedPet(pet)
        }
        id = pet.id
      }
      const report = await api.createReport({
        pet_id: id,
        last_seen_at: new Date(lastSeen).toISOString(),
        district,
        area_note: areaNote || null,
        description: description || null,
      })
      if (user) rememberReport(user.id, report.id)
      navigate(`/reports/${report.id}`)
    } catch (caught) {
      setError(caught as ApiError)
    } finally {
      setBusy(false)
    }
  }

  if (pets === null) return <p className="loading" role="status">กำลังโหลด…</p>

  return (
    <form onSubmit={submit} className="stack" noValidate>
      <h1>แจ้งสัตว์หาย</h1>
      <ErrorBanner error={bannerError} />

      <fieldset className="card stack">
        <legend>สัตว์ตัวไหน</legend>
        <Field id="pet_id" label="เลือกสัตว์เลี้ยง" error={fieldMessage('pet_id')}>
          <select value={petId} onChange={(e) => setPetId(e.target.value)}>
            {pets.map((p) => <option key={p.id} value={p.id}>{p.name} ({SPECIES_TH[p.species]})</option>)}
            <option value={NEW_PET}>เพิ่มสัตว์ตัวใหม่</option>
          </select>
        </Field>
        {addingPet && (
          <>
            <Field id="name" label="ชื่อสัตว์เลี้ยง" error={fieldMessage('name')}>
              <input value={createdPet?.name ?? name} onChange={(e) => setName(e.target.value)} maxLength={80}
                     disabled={!!createdPet} />
            </Field>
            <Field id="species" label="ชนิด" error={fieldMessage('species')}>
              <select value={createdPet?.species ?? species} onChange={(e) => setSpecies(e.target.value as Species)}
                      disabled={!!createdPet}>
                {Object.entries(SPECIES_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field id="color" label="สี" error={fieldMessage('color')}>
              <input value={createdPet ? (createdPet.color ?? '') : color} onChange={(e) => setColor(e.target.value)}
                     maxLength={80} disabled={!!createdPet} />
            </Field>
            <Field id="marks" label="ลักษณะเด่นของตัวสัตว์" error={fieldMessage('marks')}
                   hint="สิ่งที่ทำให้คนแยกตัวนี้จากตัวอื่นได้ เช่น ปลอกคอ รอยแผล หางด้วน">
              <textarea value={createdPet ? (createdPet.marks ?? '') : marks} onChange={(e) => setMarks(e.target.value)}
                        maxLength={500} rows={3} disabled={!!createdPet} />
            </Field>
          </>
        )}
      </fieldset>

      <fieldset className="card stack">
        <legend>หายเมื่อไหร่ ที่ไหน</legend>
        <Field id="last_seen_at" label="เห็นครั้งสุดท้ายเมื่อ" error={fieldMessage('last_seen_at')}>
          <input type="datetime-local" value={lastSeen} max={toLocalInput(new Date())}
                 onChange={(e) => setLastSeen(e.target.value)} />
        </Field>
        <Field id="district" label="เขต" error={fieldMessage('district')}>
          <input value={district} onChange={(e) => setDistrict(e.target.value)} list="districts" autoComplete="off" aria-required="true" />
        </Field>
        <datalist id="districts">{DISTRICTS.map((d) => <option key={d} value={d} />)}</datalist>
        <Field id="area_note" label="จุดสังเกต" error={fieldMessage('area_note')} hint="เช่น ปากซอยหมู่บ้าน หน้าร้านสะดวกซื้อ">
          <input value={areaNote} onChange={(e) => setAreaNote(e.target.value)} maxLength={200} />
        </Field>
      </fieldset>

      <fieldset className="card stack">
        <legend>ลักษณะเด่น</legend>
        <Field id="description" label="รายละเอียดที่ช่วยให้จำได้" error={fieldMessage('description')}
               hint="สิ่งที่ทำให้คนแยกตัวนี้จากตัวอื่นได้ เช่น ปลอกคอ รอยแผล หางด้วน">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={4} />
        </Field>
      </fieldset>

      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'กำลังประกาศ…' : 'แจ้งสัตว์หาย'}</button>
    </form>
  )
}
