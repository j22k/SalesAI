import { useAnimations, useFBX, useGLTF } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useControls } from "leva";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const corresponding = {
  A: "viseme_PP",
  B: "viseme_kk",
  C: "viseme_I",
  D: "viseme_AA",
  E: "viseme_O",
  F: "viseme_U",
  G: "viseme_FF",
  H: "viseme_TH",
  X: "viseme_PP",
};

export function Avatar(props) {
  const { responseAudio } = props;
  const {
    headFollow,
    smoothMorphTarget,
    morphTargetSmoothing,
  } = useControls({
    headFollow: true,
    smoothMorphTarget: true,
    morphTargetSmoothing: 0.5,
  });

  const [currentAudioSrc, setCurrentAudioSrc] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (responseAudio) {
      setCurrentAudioSrc(responseAudio);
    }
  }, [responseAudio]);

  const lipsync = useMemo(() => {
    try {
      // Assuming the JSON is dynamically loaded based on the current audio
      const jsonFile = responseAudio 
        ? localStorage.getItem(`lipsync_${responseAudio.split('/').pop()}`) 
        : null;
      return jsonFile ? JSON.parse(jsonFile) : { mouthCues: [] };
    } catch (error) {
      console.error("Error parsing lipsync data", error);
      return { mouthCues: [] };
    }
  }, [responseAudio]);

  useEffect(() => {
    if (currentAudioSrc) {
      audioRef.current = new Audio(currentAudioSrc);
      audioRef.current.play();
      setAnimation("Greeting");

      return () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      };
    } else {
      setAnimation("Idle");
    }
  }, [currentAudioSrc]);

  // Rest of the component remains similar to the original implementation...
  const { nodes, materials } = useGLTF("/models/646d9dcdc8a5f5bddbfac913.glb");
  const { animations: idleAnimation } = useFBX("/animations/Idle.fbx");
  const { animations: angryAnimation } = useFBX("/animations/Angry Gesture.fbx");
  const { animations: greetingAnimation } = useFBX("/animations/Standing Greeting.fbx");

  idleAnimation[0].name = "Idle";
  angryAnimation[0].name = "Angry";
  greetingAnimation[0].name = "Greeting";

  const [animation, setAnimation] = useState("Idle");

  const group = useRef();
  const { actions } = useAnimations(
    [idleAnimation[0], angryAnimation[0], greetingAnimation[0]],
    group
  );

  useEffect(() => {
    actions[animation].reset().fadeIn(0.5).play();
    return () => actions[animation].fadeOut(0.5);
  }, [animation]);

  useFrame((state) => {
    if (headFollow) {
      group.current.getObjectByName("Head").lookAt(state.camera.position);
    }

    const currentAudioTime = audioRef.current ? audioRef.current.currentTime : 0;
    
    // Lip-sync logic
    Object.values(corresponding).forEach((value) => {
      if (!smoothMorphTarget) {
        nodes.Wolf3D_Head.morphTargetInfluences[
          nodes.Wolf3D_Head.morphTargetDictionary[value]
        ] = 0;
        nodes.Wolf3D_Teeth.morphTargetInfluences[
          nodes.Wolf3D_Teeth.morphTargetDictionary[value]
        ] = 0;
      } else {
        nodes.Wolf3D_Head.morphTargetInfluences[
          nodes.Wolf3D_Head.morphTargetDictionary[value]
        ] = THREE.MathUtils.lerp(
          nodes.Wolf3D_Head.morphTargetInfluences[
            nodes.Wolf3D_Head.morphTargetDictionary[value]
          ],
          0,
          morphTargetSmoothing
        );

        nodes.Wolf3D_Teeth.morphTargetInfluences[
          nodes.Wolf3D_Teeth.morphTargetDictionary[value]
        ] = THREE.MathUtils.lerp(
          nodes.Wolf3D_Teeth.morphTargetInfluences[
            nodes.Wolf3D_Teeth.morphTargetDictionary[value]
          ],
          0,
          morphTargetSmoothing
        );
      }
    });

    for (let i = 0; i < lipsync.mouthCues.length; i++) {
      const mouthCue = lipsync.mouthCues[i];
      if (
        currentAudioTime >= mouthCue.start &&
        currentAudioTime <= mouthCue.end
      ) {
        if (!smoothMorphTarget) {
          nodes.Wolf3D_Head.morphTargetInfluences[
            nodes.Wolf3D_Head.morphTargetDictionary[
              corresponding[mouthCue.value]
            ]
          ] = 1;
          nodes.Wolf3D_Teeth.morphTargetInfluences[
            nodes.Wolf3D_Teeth.morphTargetDictionary[
              corresponding[mouthCue.value]
            ]
          ] = 1;
        } else {
          nodes.Wolf3D_Head.morphTargetInfluences[
            nodes.Wolf3D_Head.morphTargetDictionary[
              corresponding[mouthCue.value]
            ]
          ] = THREE.MathUtils.lerp(
            nodes.Wolf3D_Head.morphTargetInfluences[
              nodes.Wolf3D_Head.morphTargetDictionary[
                corresponding[mouthCue.value]
              ]
            ],
            1,
            morphTargetSmoothing
          );
          nodes.Wolf3D_Teeth.morphTargetInfluences[
            nodes.Wolf3D_Teeth.morphTargetDictionary[
              corresponding[mouthCue.value]
            ]
          ] = THREE.MathUtils.lerp(
            nodes.Wolf3D_Teeth.morphTargetInfluences[
              nodes.Wolf3D_Teeth.morphTargetDictionary[
                corresponding[mouthCue.value]
              ]
            ],
            1,
            morphTargetSmoothing
          );
        }
        break;
      }
    }
  });
  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips} />
      <skinnedMesh
        geometry={nodes.Wolf3D_Body.geometry}
        material={materials.Wolf3D_Body}
        skeleton={nodes.Wolf3D_Body.skeleton}
      />
      <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Bottom.geometry}
        material={materials.Wolf3D_Outfit_Bottom}
        skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton}
      />
      <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Footwear.geometry}
        material={materials.Wolf3D_Outfit_Footwear}
        skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton}
      />
      <skinnedMesh
        geometry={nodes.Wolf3D_Outfit_Top.geometry}
        material={materials.Wolf3D_Outfit_Top}
        skeleton={nodes.Wolf3D_Outfit_Top.skeleton}
      />
      <skinnedMesh
        geometry={nodes.Wolf3D_Hair.geometry}
        material={materials.Wolf3D_Hair}
        skeleton={nodes.Wolf3D_Hair.skeleton}
      />
      <skinnedMesh
        name="EyeLeft"
        geometry={nodes.EyeLeft.geometry}
        material={materials.Wolf3D_Eye}
        skeleton={nodes.EyeLeft.skeleton}
        morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary}
        morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences}
      />
      <skinnedMesh
        name="EyeRight"
        geometry={nodes.EyeRight.geometry}
        material={materials.Wolf3D_Eye}
        skeleton={nodes.EyeRight.skeleton}
        morphTargetDictionary={nodes.EyeRight.morphTargetDictionary}
        morphTargetInfluences={nodes.EyeRight.morphTargetInfluences}
      />
      <skinnedMesh
        name="Wolf3D_Head"
        geometry={nodes.Wolf3D_Head.geometry}
        material={materials.Wolf3D_Skin}
        skeleton={nodes.Wolf3D_Head.skeleton}
        morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary}
        morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences}
      />
      <skinnedMesh
        name="Wolf3D_Teeth"
        geometry={nodes.Wolf3D_Teeth.geometry}
        material={materials.Wolf3D_Teeth}
        skeleton={nodes.Wolf3D_Teeth.skeleton}
        morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary}
        morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences}
      />
    </group>
  );
}

useGLTF.preload("/models/646d9dcdc8a5f5bddbfac913.glb");