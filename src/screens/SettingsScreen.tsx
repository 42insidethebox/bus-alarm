import React,{useEffect,useState} from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { parseBackup } from '../backup';
import { testBell } from '../notifications';
import { useStore } from '../store';
import { Button, Card, Heading, useColors } from '../ui';

export function SettingsScreen(){
  const c=useColors();
  const {timetables,places,scheduled,refreshAlarms,restore}=useStore();
  const[permissions,setPermissions]=useState({notifications:'checking',location:'checking'});
  const checkPermissions=async()=>setPermissions({notifications:(await Notifications.getPermissionsAsync()).status,location:(await Location.getForegroundPermissionsAsync()).status});
  useEffect(()=>{void checkPermissions()},[]);
  const backup=JSON.stringify({version:1,exportedAt:new Date().toISOString(),timetables,places},null,2);
  const restoreClipboard=async()=>{
    try{
      const parsed=parseBackup(await Clipboard.getStringAsync());
      Alert.alert('Replace all BusBell data?',`${parsed.timetables.length} timetables and ${parsed.places.length} places will be restored.`,[
        {text:'Cancel',style:'cancel'},
        {text:'Restore',style:'destructive',onPress:async()=>{await restore(parsed.timetables,parsed.places);Alert.alert('Restore complete');}},
      ]);
    }catch(error){Alert.alert('Cannot restore',error instanceof Error?error.message:'Invalid backup.');}
  };
  return <ScrollView contentContainerStyle={s.page}>
    <Heading sub="Private, local, and deliberately simple.">Settings</Heading>
    <Card><Text style={[s.title,{color:c.ink}]}>Permission health</Text><Text style={{color:c.muted}}>Notifications: {permissions.notifications}</Text><Text style={{color:c.muted}}>Location: {permissions.location}</Text><Button title="Refresh permission status" kind="ghost" onPress={()=>void checkPermissions()}/><Button title="Open system settings" kind="ghost" onPress={()=>void Linking.openSettings()}/></Card>
    <Card><Text style={[s.title,{color:c.ink}]}>Alarm status</Text><Text style={{color:c.muted}}>{scheduled} reminders are queued. BusBell keeps the nearest 60 alarms, then replenishes them whenever the app opens.</Text><Button title="Reschedule now" kind="ghost" onPress={async()=>Alert.alert('Alarms refreshed',`${await refreshAlarms()} reminders queued.`)}/><Button title="Send test bell" onPress={async()=>{if(!await testBell())Alert.alert('Notifications disabled','Enable notifications in system settings.')}}/></Card>
    <Card><Text style={[s.title,{color:c.ink}]}>Backup and restore</Text><Text style={{color:c.muted}}>Copy all data as JSON, or restore a BusBell backup currently on your clipboard.</Text><Button title="Copy backup" kind="ghost" onPress={async()=>{await Clipboard.setStringAsync(backup);Alert.alert('Copied','Your BusBell backup is on the clipboard.')}}/><Button title="Restore from clipboard" kind="ghost" onPress={()=>void restoreClipboard()}/></Card>
    <Card><Text style={[s.title,{color:c.ink}]}>Privacy</Text><Text style={{color:c.muted,lineHeight:21}}>No account, ads, analytics, or cloud. Timetables and locations stay in the local SQLite database. Location is checked only when refreshing alarms.</Text></Card>
    <Text style={{color:c.muted,textAlign:'center'}}>BusBell 1.0 · Made for rare buses</Text>
  </ScrollView>;
}
const s=StyleSheet.create({page:{padding:20,gap:14},title:{fontSize:19,fontWeight:'800'}});
