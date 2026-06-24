from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from auth import get_current_user
from db import get_db
from models_db import Trip, User
from models_db import Trip as TripModel
from trip_api_backend import TripData

router = APIRouter(prefix="/api/trips", tags=["trips"])


def _to_trip_data(trip: TripModel) -> TripData:
    return TripData.model_validate_json(trip.trip_json)


def _get_owned_trip(db: DBSession, trip_id: int, user: User) -> TripModel:
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user.id).first()
    if trip is None:
        # 404, not 403 — avoid leaking existence of other users' trips.
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@router.get("")
def list_trips(
    user: User = Depends(get_current_user), db: DBSession = Depends(get_db)
) -> list[dict]:
    trips = db.query(Trip).filter(Trip.user_id == user.id).all()
    return [{"id": t.id, "trip_data": _to_trip_data(t).model_dump()} for t in trips]


@router.post("")
def create_trip(
    trip_data: TripData,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> dict:
    trip = Trip(
        user_id=user.id,
        title=trip_data.title,
        dates=trip_data.dates,
        trip_json=trip_data.model_dump_json(),
    )
    db.add(trip)
    db.commit()
    return {"id": trip.id, "trip_data": trip_data.model_dump()}


@router.get("/{trip_id}")
def get_trip(
    trip_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)
) -> dict:
    trip = _get_owned_trip(db, trip_id, user)
    return {"id": trip.id, "trip_data": _to_trip_data(trip).model_dump()}


@router.put("/{trip_id}")
def update_trip(
    trip_id: int,
    trip_data: TripData,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> dict:
    trip = _get_owned_trip(db, trip_id, user)
    trip.title = trip_data.title
    trip.dates = trip_data.dates
    trip.trip_json = trip_data.model_dump_json()
    db.add(trip)
    db.commit()
    return {"id": trip.id, "trip_data": trip_data.model_dump()}


@router.delete("/{trip_id}")
def delete_trip(
    trip_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)
) -> dict:
    trip = _get_owned_trip(db, trip_id, user)
    db.delete(trip)
    db.commit()
    return {"status": "deleted"}
