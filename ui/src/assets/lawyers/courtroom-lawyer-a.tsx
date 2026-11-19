import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { courtA } from '../primitives/counsel-colors'
import { CounselSuit, HumanHead } from '../primitives/counsel'

function CourtCounselA() { return <><CounselSuit p={courtA}/><HumanHead p={courtA}/><path d="M28 33H31V35H28Z" fill={courtA.accent}/></>; }

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><g className="sprite-body"><g transform="scale(2)"><CourtCounselA/></g></g></SvgFrame>
}
