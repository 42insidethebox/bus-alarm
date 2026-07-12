import { create } from 'zustand';
import * as Location from 'expo-location';
import { getPlaces, getTimetables, removePlace, removeTimetable, replaceAll, savePlace, saveTimetable } from './database';
import { reschedule } from './notifications';
import { Place, Timetable } from './types';

type State = { timetables:Timetable[]; places:Place[]; ready:boolean; scheduled:number; coords?:{latitude:number;longitude:number}; load:()=>Promise<void>; persistTimetable:(t:Timetable)=>Promise<void>; deleteTimetable:(id:string)=>Promise<void>; persistPlace:(p:Place)=>Promise<void>; deletePlace:(id:string)=>Promise<void>; restore:(t:Timetable[],p:Place[])=>Promise<void>; refreshAlarms:()=>Promise<number>; };
export const useStore=create<State>((set,get)=>({
  timetables:[],places:[],ready:false,scheduled:0,
  load:async()=>{const [timetables,places]=await Promise.all([getTimetables(),getPlaces()]); let coords;
    try { if((await Location.getForegroundPermissionsAsync()).status==='granted') coords=(await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced})).coords; } catch {}
    set({timetables,places,ready:true,coords}); const scheduled=await reschedule(timetables,places,coords); set({scheduled});},
  refreshAlarms:async()=>{const {timetables,places}=get();let coords=get().coords;try{if((await Location.getForegroundPermissionsAsync()).status==='granted')coords=(await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced})).coords}catch{}const scheduled=await reschedule(timetables,places,coords);set({scheduled,coords});return scheduled;},
  persistTimetable:async t=>{await saveTimetable(t);set(s=>({timetables:[...s.timetables.filter(x=>x.id!==t.id),t].sort((a,b)=>a.name.localeCompare(b.name))}));await get().refreshAlarms();},
  deleteTimetable:async id=>{await removeTimetable(id);set(s=>({timetables:s.timetables.filter(x=>x.id!==id)}));await get().refreshAlarms();},
  persistPlace:async p=>{await savePlace(p);set(s=>({places:[...s.places.filter(x=>x.id!==p.id),p].sort((a,b)=>a.name.localeCompare(b.name))}));await get().refreshAlarms();},
  deletePlace:async id=>{await removePlace(id);set(s=>({places:s.places.filter(x=>x.id!==id),timetables:s.timetables.map(t=>t.locationId===id?{...t,locationId:null}:t)}));await get().refreshAlarms();},
  restore:async(timetables,places)=>{await replaceAll(timetables,places);set({timetables,places});await get().refreshAlarms();},
}));
