import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Place, Timetable } from './types';
import { distanceMeters, formatLocalDate, timeToMinutes } from './utils';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner:true, shouldShowList:true, shouldPlaySound:true, shouldSetBadge:false }) });

export async function ensureNotificationPermission() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('departures',{name:'Departure reminders',importance:Notifications.AndroidImportance.HIGH,sound:'default',vibrationPattern:[0,300,150,500]});
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  return (await Notifications.requestPermissionsAsync()).status === 'granted';
}

export async function reschedule(timetables:Timetable[], places:Place[], coords?:{latitude:number;longitude:number}) {
  if (!(await ensureNotificationPermission())) return 0;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = new Date();
  const candidates:{table:Timetable;time:string;lead:number;date:Date}[]=[];
  for (const table of timetables.filter(t=>t.enabled)) {
    if(table.pausedUntil&&new Date(table.pausedUntil)>now)continue;
    const place = places.find(p=>p.id===table.locationId);
    if (place && (!coords || distanceMeters(coords.latitude,coords.longitude,place.latitude,place.longitude)>place.radius)) continue;
    for (let offset=0;offset<30;offset++) for (const time of table.times) for(const lead of table.alertMinutesList?.length?table.alertMinutesList:[table.alertMinutes]) {
      const date = new Date(now); date.setHours(0,0,0,0); date.setDate(date.getDate()+offset);
      if (!table.days.includes(date.getDay())) continue;
      const departureDate=formatLocalDate(date);
      if(table.excludedDates?.includes(departureDate))continue;
      date.setMinutes(timeToMinutes(time)-lead);
      if (date<=now) continue;
      candidates.push({table,time,lead,date});
    }
  }
  // iOS only retains 64 pending local notifications. Keep four slots free for
  // test/system notifications and always schedule the soonest departures first.
  const upcoming=candidates.sort((a,b)=>a.date.getTime()-b.date.getTime()).slice(0,60);
  for(const {table,time,lead,date} of upcoming) {
    await Notifications.scheduleNotificationAsync({content:{title:`${table.name} in ${lead} min`,body:`Departure at ${time}`,sound:'default',data:{timetableId:table.id}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date,channelId:'departures'}});
  }
  return upcoming.length;
}

export async function testBell() {
  if (!(await ensureNotificationPermission())) return false;
  await Notifications.scheduleNotificationAsync({content:{title:'BusBell is ready 🔔',body:'Your reminders will sound like this.',sound:'default'},trigger:null});
  return true;
}
