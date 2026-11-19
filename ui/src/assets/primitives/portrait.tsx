import { warm, deep, type PortraitColors } from './portrait-colors'

export function Face({ colors = warm, smile = true }: { colors?: PortraitColors; smile?: boolean }) {
  return <>
    <path d="M30 20H38V16H58V20H66V28H70V44H66V52H60V58H38V54H30V46H26V30H30Z" fill={colors.shade}/>
    <path d="M32 20H40V18H56V22H64V30H66V44H62V50H58V54H40V50H34V44H30V30H32Z" fill={colors.skin}/>
    <path d="M36 24H42V22H54V26H60V32H62V42H58V46H40V42H34V32H36Z" fill={colors.light}/>
    <path d="M26 34H30V44H26V40H24V36H26ZM66 34H70V38H72V42H66Z" fill={colors.skin}/>
    <path d="M32 32H42V34H32ZM52 32H62V34H52Z" fill={colors.hair}/>
    <path d="M34 36H44V44H34ZM52 36H62V44H52Z" fill={colors.white}/>
    <path d="M38 36H44V44H38ZM52 36H58V44H52Z" fill={colors.ink}/>
    <path d="M38 36H40V38H38ZM52 36H54V38H52Z" fill="#ffffff"/>
    <path d="M46 40H50V46H54V48H46Z" fill={colors.shade}/>
    <g className="sprite-mouth">
      {smile ? <><path d="M40 48H56V52H52V54H44V52H40Z" fill={colors.ink}/><path d="M42 48H54V50H42Z" fill={colors.white}/></> : <path d="M42 50H54V52H42Z" fill={colors.ink}/>}
    </g>
  </>;
}

export function ShortHair({ color = warm.hair, highlight = warm.hairLight }: { color?: string; highlight?: string }) {
  return <>
    <path d="M28 32V20H32V14H42V10H58V14H66V20H70V34H64V26H56V24H46V20H40V26H34V34Z" fill={color}/>
    <path d="M32 20H40V16H54V14H58V18H64V22H54V20H46V18H40V22H34V28H30V24H32Z" fill={highlight}/>
    <path d="M28 34H32V42H28ZM64 32H68V40H64Z" fill={color}/>
  </>;
}

export function CurlyHair({ color = deep.hair, highlight = deep.hairLight }: { color?: string; highlight?: string }) {
  return <>
    <path d="M28 38H24V24H28V18H32V12H40V10H48V12H54V10H62V14H68V20H72V30H68V40H64V28H58V24H50V26H42V22H36V28H32V38Z" fill={color}/>
    <path d="M30 20H34V16H40V14H46V18H40V20H34V26H28V24H30ZM50 16H56V14H62V18H66V24H60V20H54V22H50Z" fill={highlight}/>
  </>;
}

export function Boots({ suit, light, ink = "#222938" }: { suit: string; light: string; ink?: string }) {
  return <>
    <path d="M32 82H46V104H42V108H24V102H30V88H32ZM52 82H66V100H72V108H52Z" fill={ink}/>
    <path d="M34 86H44V100H40V104H28V102H34ZM54 86H64V100H68V104H54Z" fill={suit}/>
    <path d="M34 88H38V100H34ZM54 88H58V102H54Z" fill={light}/>
    <path d="M28 104H42V106H28ZM54 104H68V106H54Z" fill={light}/>
  </>;
}

export function Gavel({ wood = "#ab7043", shine = "#e7bc71", outline = "#4f382e" }: { wood?: string; shine?: string; outline?: string }) {
  return <>
    <path d="M78 42H82V72H76V66H78Z" fill={outline}/>
    <path d="M78 48H80V66H78Z" fill={wood}/>
    <path d="M68 32H86V36H90V46H86V50H68V46H64V36H68Z" fill={outline}/>
    <path d="M68 36H86V44H68Z" fill={wood}/>
    <path d="M70 36H84V38H70ZM68 38H70V44H68Z" fill={shine}/>
    <path d="M82 38H86V44H82Z" fill={outline} opacity=".45"/>
  </>;
}
