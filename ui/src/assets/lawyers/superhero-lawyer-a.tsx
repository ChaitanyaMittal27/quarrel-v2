import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { heroA } from '../primitives/counsel-colors'
import { CounselSuit, HumanHead, Cape } from '../primitives/counsel'

function HeroCounselA() { return <><Cape p={heroA}/><CounselSuit p={heroA} digital/><HumanHead p={heroA} glasses/><path d="M18 29H21V31H18ZM29 29H32V31H29Z" fill={heroA.accent}/></>; }

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><g className="sprite-body"><g transform="scale(2)"><HeroCounselA/></g></g></SvgFrame>
}
