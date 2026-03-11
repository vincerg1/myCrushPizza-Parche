import { useEffect } from "react"
import { useParams } from "react-router-dom"
import api from "../setupAxios"

export default function ReservationCancelPage(){

  const { id } = useParams()

  useEffect(()=>{

    async function cancel(){

      try{

        await api.patch(`/api/reservations/${id}/cancel`)

        alert("Reserva cancelada correctamente")

      }catch(err){

        alert("No se pudo cancelar la reserva")

      }

    }

    cancel()

  },[id])

  return (
    <div style={{padding:40,textAlign:"center"}}>
      Cancelando reserva...
    </div>
  )

}