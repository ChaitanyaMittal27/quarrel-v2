import type { Colors } from './counsel-colors'

export function Casebook({ p, digital = false }: { p: Colors; digital?: boolean }) {
  return <>
    <path d="M32 34H44V50H32Z" fill={p.ink}/><path d="M34 35H43V48H34Z" fill={p.accent}/>
    <path d="M35 37H41V45H35Z" fill={digital ? p.edge : p.paper}/>
    <path d="M36 39H40V40H36ZM36 42H39V43H36Z" fill={p.ink}/>
    <path d="M33 35H35V48H33Z" fill={p.suit}/><path d="M35 48H43V49H35Z" fill={p.paper}/>
  </>;
}

export function CounselSuit({ p, striped = false, digital = false }: { p: Colors; striped?: boolean; digital?: boolean }) {
  return <>
    <path d="M16 41H23V53H21V55H12V52H15ZM27 41H34V51H37V55H27Z" fill={p.ink}/>
    <path d="M17 43H21V51H17ZM29 43H32V52H29Z" fill={p.suit}/><path d="M14 53H21V54H14ZM29 53H35V54H29Z" fill={p.edge}/>
    <path d="M16 27H31V29H35V32H37V44H33V48H15V45H12V32H14V29H16Z" fill={p.ink}/>
    <path d="M16 29H31V31H33V44H30V46H17V43H15V32H16Z" fill={p.suit}/>
    <path d="M17 30H20V43H17ZM30 32H32V43H30Z" fill={p.edge}/>
    {striped && <path d="M16 34H17V43H16ZM19 36H20V44H19ZM28 36H29V44H28ZM31 34H32V43H31Z" fill={p.paper} opacity=".4"/>}
    <path d="M20 27H28V30H30V32H27V35H22V32H19V30H20Z" fill={p.paper}/>
    <path d="M23 31H26V34H25V40H23V34H22V32H23Z" fill={p.accent}/>
    <path d="M18 30H20V33H23V38H21V35H19V33H18ZM29 30H31V33H29V35H27V38H25V35H27V33H29Z" fill={p.edge}/>
    <path d="M13 31H17V35H15V42H11V46H7V41H9V35H11V32H13Z" fill={p.ink}/>
    <path d="M12 34H15V37H13V42H10V43H9V41H11V37H12Z" fill={p.suit}/>
    <path d="M8 43H12V45H14V49H9V48H7V45H8Z" fill={p.skin}/><path d="M9 44H11V46H9Z" fill={p.light}/>
    <path d="M31 30H35V33H39V40H35V37H32Z" fill={p.suit}/>
    <Casebook p={p} digital={digital}/>
    <path d="M31 40H35V42H37V45H33V44H31Z" fill={p.skin}/><path d="M32 40H35V42H32Z" fill={p.light}/>
    <path d="M23 41H25V43H23Z" fill={p.accent}/>
  </>;
}

export function HumanHead({ p, curls = false, glasses = false }: { p: Colors; curls?: boolean; glasses?: boolean }) {
  return <>
    <path d="M16 8H20V6H29V8H32V12H34V21H32V25H29V28H20V26H16V23H14V13H16Z" fill={p.shade}/>
    <path d="M17 10H21V8H28V10H31V14H32V21H30V24H27V26H21V24H18V21H16V14H17Z" fill={p.skin}/>
    <path d="M19 12H23V10H28V13H30V20H28V22H20V20H18V14H19Z" fill={p.light}/>
    <path d="M13 17H16V22H13ZM32 17H35V21H32Z" fill={p.skin}/>
    <path d="M18 16H23V20H18ZM26 16H31V20H26Z" fill={p.paper}/>
    <path d="M20 16H23V20H20ZM26 16H29V20H26Z" fill={p.ink}/>
    <path d="M20 16H21V17H20ZM26 16H27V17H26Z" fill="#ffffff"/>
    <path d="M24 19H26V22H27V23H24Z" fill={p.shade}/>
    <g className="sprite-mouth"><path d="M21 24H28V26H23V25H21Z" fill={p.ink}/><path d="M22 24H27V25H22Z" fill={p.paper}/></g>
    {curls ? <>
      <path d="M14 18H12V11H14V7H17V4H21V3H25V4H29V3H32V6H35V10H36V16H33V13H30V11H27V12H23V10H20V12H17V18Z" fill={p.hair}/>
      <path d="M16 9H18V6H21V5H24V7H21V9H18V12H15V11H16ZM27 6H30V5H32V8H34V11H31V9H28Z" fill={p.hairLight}/>
    </> : <>
      <path d="M14 17V10H16V6H20V3H28V4H32V7H34V15H31V12H27V10H22V8H20V11H17V17Z" fill={p.hair}/>
      <path d="M17 8H20V6H25V5H29V7H31V9H26V8H22V7H20V9H17V12H15V10H17Z" fill={p.hairLight}/>
    </>}
    {glasses && <><path d="M16 15H24V16H26V15H33V21H26V18H24V21H16Z" fill={p.accent}/><path d="M18 17H22V19H18ZM28 17H31V19H28Z" fill={p.paper}/><path d="M20 17H22V19H20ZM28 17H30V19H28Z" fill={p.ink}/></>}
  </>;
}

export function Cape({ p }: { p: Colors }) {
  return <><path d="M13 27H33V31H36V40H39V53H29V49H20V53H7V48H10V36H13Z" fill={p.ink}/><path d="M14 29H31V33H33V42H35V50H29V46H20V50H10V46H12V36H14Z" fill={p.edge}/><path d="M14 33H17V46H13V48H11V44H13Z" fill={p.accent}/></>;
}
