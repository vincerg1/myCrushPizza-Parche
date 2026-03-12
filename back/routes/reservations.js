const express = require("express")
const sendSMS = require("../utils/sendSMS")
const { buildReservationSMS } = require("../utils/reservationSMS")

module.exports = (prisma) => {

const router = express.Router()

/* ───────── CREATE RESERVATION ───────── */

router.post("/", async (req, res) => {

  try {

    const {
      storeId,
      customerName,
      customerPhone,
      partySize,
      reservationDate,
      reservationTime
    } = req.body

    if (!storeId || !customerName || !partySize || !reservationDate || !reservationTime) {
      return res.status(400).json({ error:"missing fields" })
    }

    const reservationDateTime =
      new Date(`${reservationDate}T${reservationTime}:00`)

const reservation = await prisma.$transaction(async (tx) => {

  const store = await tx.store.findUnique({
    where:{ id:Number(storeId) }
  })

  if(!store){
    throw new Error("store not found")
  }

  const capacity = store.reservationCapacity || 0

  const existing = await tx.reservation.findMany({
    where:{
      storeId:Number(storeId),
      reservationDate:new Date(reservationDate),
      reservationTime,
      status:"pending"
    }
  })

  const occupied =
    existing.reduce((sum,r)=>sum+r.partySize,0)

  const remaining =
    capacity - occupied

  if(remaining < partySize){
    throw new Error("no capacity")
  }

  return await tx.reservation.create({
    data:{
      storeId:Number(storeId),
      customerName,
      customerPhone: customerPhone || null,
      partySize:Number(partySize),
      reservationDate:new Date(reservationDate),
      reservationTime,
      reservationDateTime
    }
  })

})

/* ───────── SMS CONFIRMATION ───────── */

if (customerPhone) {

  const cancelLink =
    `${process.env.FRONT_BASE_URL}/reservation/${reservation.id}/cancel`

  const smsText = buildReservationSMS({
    customerName,
    reservationDate,
    reservationTime,
    partySize,
    cancelLink
  })

  try {

    await sendSMS(customerPhone, smsText)

  } catch (e) {

    console.error("Reservation SMS error:", e.message)

  }

}

res.json(reservation)

  } catch(err){

    console.error("[POST /reservations]", err)
    res.status(500).json({ error:"internal error" })

  }

})

/* ───────── AVAILABILITY ───────── */

router.get("/availability", async (req, res) => {

  try {

    const storeId = Number(req.query.storeId)
    const date = req.query.date
    const partySize = Number(req.query.partySize || 1)

    if (!storeId || !date) {
      return res.status(400).json({ error:"storeId and date required" })
    }

    const store = await prisma.store.findUnique({
      where:{ id:storeId }
    })

    if (!store) {
      return res.status(404).json({ error:"store not found" })
    }

    const capacity = store.reservationCapacity || 0

    const reservations = await prisma.reservation.findMany({
      where:{
        storeId,
        reservationDate:new Date(date),
        status:"pending"
      }
    })

/* ───────── STORE HOURS ───────── */

const targetDate = new Date(date)
const dayOfWeek = targetDate.getDay()

const storeHours = await prisma.storeHours.findFirst({
  where:{
    storeId,
    dayOfWeek
  }
})

if (!storeHours) {
  return res.json({
    capacity,
    availability:[]
  })
}

const open = storeHours.openTime + 30
const close = storeHours.closeTime - 60

const slots = []

for (let m = open; m <= close; m += 30) {

  const h = Math.floor(m / 60)
  const min = m % 60

  const time =
    String(h).padStart(2,"0") +
    ":" +
    String(min).padStart(2,"0")

  slots.push(time)

}

/* ───────── GROUP RESERVATIONS ───────── */

const occupiedByTime = {}

reservations.forEach(r => {

  if (!occupiedByTime[r.reservationTime]) {
    occupiedByTime[r.reservationTime] = 0
  }

  occupiedByTime[r.reservationTime] += r.partySize

})

/* ───────── CALCULATE AVAILABILITY ───────── */

const availability = slots.map(time => {

  const occupied = occupiedByTime[time] || 0
  const available = capacity - occupied

  return {
    time,
    occupied,
    available,
    canFit: available >= partySize
  }

})

res.json({
  capacity,
  availability
})

  } catch(err){

    console.error("[GET /reservations/availability]", err)
    res.status(500).json({ error:"internal error" })

  }

})

/* ───────── STORE RESERVATIONS ───────── */

router.get("/store/:storeId", async (req, res) => {

  try {

    const storeId = Number(req.params.storeId)

    const reservations = await prisma.reservation.findMany({
      where:{ storeId },
      orderBy:{ reservationDateTime:"asc" }
    })

    res.json(reservations)

  } catch(err){

    console.error("[GET /reservations/store]", err)
    res.status(500).json({ error:"internal error" })

  }

})

/* ───────── CANCEL RESERVATION ───────── */

router.patch("/:id/cancel", async (req, res) => {

  try {

    const id = Number(req.params.id)

    const updated = await prisma.reservation.update({
      where:{ id },
      data:{ status:"cancelled" }
    })

    res.json(updated)

  } catch(err){

    console.error("[PATCH /reservations/cancel]", err)
    res.status(500).json({ error:"internal error" })

  }

})

/* ───────── COMPLETE RESERVATION ───────── */

router.patch("/:id/complete", async (req, res) => {

  try {

    const id = Number(req.params.id)

    const updated = await prisma.reservation.update({
      where:{ id },
      data:{ status:"completed" }
    })

    res.json(updated)

  } catch(err){

    console.error("[PATCH /reservations/complete]", err)
    res.status(500).json({ error:"internal error" })

  }

})

// ───────────────── TODAY RESERVATIONS (POS) ─────────────────

router.get("/today/:storeId", async (req, res) => {

  try {

    const storeId = Number(req.params.storeId);

    if (!storeId) {
      return res.status(400).json({ error: "Invalid storeId" });
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const reservations = await prisma.reservation.findMany({

      where:{
        storeId,
        status:"pending",
        reservationDate:{
          gte:today,
          lt:tomorrow
        }
      },

      orderBy:{
        reservationTime:"asc"
      },

      select:{
        id:true,
        reservationDate:true,
        reservationTime:true,
        customerName:true,
        customerPhone:true,
        partySize:true,
        status:true
      }

    });

    res.json(reservations);

  } catch (err) {

    console.error("today reservations", err);
    res.status(500).json({ error:"server error" });

  }

});

return router

}