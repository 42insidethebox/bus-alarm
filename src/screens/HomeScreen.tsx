import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, Heading, useColors } from '../ui';
import { useStore } from '../store';
import { RootStackParams } from '../types';
import { dayNames, timeToMinutes } from '../utils';

export function HomeScreen(){const c=useColors(),nav=useNavigation<NativeStackNavigationProp<RootStackParams>>();const {timetables,scheduled,refreshAlarms}=useStore();const now=new Date();
 const next=timetables.filter(t=>t.enabled).flatMap(t=>t.times.map(time=>{let best:Date|undefined;for(let i=0;i<8;i++){const d=new Date(now);d.setDate(d.getDate()+i);d.setHours(0,0,0,0);if(t.days.includes(d.getDay())){d.setMinutes(timeToMinutes(time));if(d>now){best=d;break}}}return best?{t,time,date:best}:null})).filter(Boolean).sort((a:any,b:any)=>a.date-b.date)[0] as any;
 return <ScrollView contentContainerStyle={s.page}><Heading sub="Quietly watching your recurring departures.">Good {now.getHours()<12?'morning':now.getHours()<18?'afternoon':'evening'}</Heading>
  <Card style={{backgroundColor:c.green,borderColor:c.green}}>{next?<><Text style={[s.kicker,{color:c.card}]}>NEXT DEPARTURE</Text><Text style={[s.big,{color:c.card}]}>{next.time}</Text><Text style={{color:c.card,fontSize:18,fontWeight:'700'}}>{next.t.name}</Text><Text style={{color:c.card,opacity:.8}}>{dayNames[next.date.getDay()]} · reminder {next.t.alertMinutes} min before</Text></>:<><Text style={[s.big,{color:c.card}]}>All quiet</Text><Text style={{color:c.card}}>Add your first timetable to start.</Text></>}</Card>
  <View style={s.stats}><Card style={s.stat}><Text style={[s.number,{color:c.ink}]}>{timetables.length}</Text><Text style={{color:c.muted}}>Timetables</Text></Card><Card style={s.stat}><Text style={[s.number,{color:c.ink}]}>{scheduled}</Text><Text style={{color:c.muted}}>Alarms queued</Text></Card></View>
  <Button title="Add timetable" onPress={()=>nav.navigate('TimetableEditor')}/><Button title="Refresh alarms" kind="ghost" onPress={()=>void refreshAlarms()}/>
 </ScrollView>}
const s=StyleSheet.create({page:{padding:20,gap:18},kicker:{fontSize:12,fontWeight:'800',letterSpacing:1},big:{fontSize:44,fontWeight:'900',letterSpacing:-1},stats:{flexDirection:'row',gap:12},stat:{flex:1},number:{fontSize:28,fontWeight:'800'}});
