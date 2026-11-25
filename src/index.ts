// Grip: game cameras. Shots place the camera; the director picks, blends, mixes and sequences them; nothing loses
// the player. No renderer and no page: put `director.view` on your camera each frame. Input for the shots people
// steer is in './input', kept apart so the rest runs anywhere.
export { Director, type BlendOptions, type Inspection, type SequenceOptions, type Step } from './director';
export { type Frame, type View, project } from './frame';
export { type Ease, ease, type Q, type V3 } from './math';
export { path, type Path } from './path';
export { type Kick, type KickShape, type ShakeStyle, Shaker } from './shake';
export { Shot, type Box, type Ctx, type GuardOptions, type ShotOptions, type Subject, type Zone, trips } from './shot';
export {
    Fixed, Follow, Group, Look, Orbit, Rail, Side, Still, fixed, follow, group, look, orbit, rail, side, still,
    type FixedOptions, type FollowOptions, type GroupOptions, type LookOptions, type LookPoint, type Member, type OrbitOptions, type RailOptions, type SideOptions
} from './shots';
export { Smooth, SmoothAngle, SmoothV3 } from './smooth';
