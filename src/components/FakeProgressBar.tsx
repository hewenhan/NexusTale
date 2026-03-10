import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';

export interface FakeProgressBarHandle {
  finish: () => void;
}

export interface FakeProgressBarProps {
  /** 总时间（毫秒），进度条从 0 跑到 99% 的总时长 */
  duration: number;
  /** 填充方向 */
  direction?: 'ltr' | 'rtl' | 'btt' | 'ttb';
  /** 横纵比，如 "20:1" 表示宽是高的 20 倍（横向时）；纵向时会自动反转 */
  aspectRatio?: string;
  /** 渐变色数组，如 ['#00ff88', '#00ccff'] */
  gradientColors?: string[];
  /** 动画效果 */
  animation?: 'shimmer' | 'wave' | 'pulse' | 'none';
  /** 贴合方式：outborder 贴在 DOM 外边界，inborder 贴在 DOM 内边界 */
  attach?: 'outborder' | 'inborder';
  /** 水平贴合位置百分比 0-100 */
  xPercent?: number;
  /** 垂直贴合位置百分比 0-100 */
  yPercent?: number;
  /** 是否显示百分比 */
  showPercent?: boolean;
  /** 进度条厚度（px），默认 4 */
  thickness?: number;
}

// 生成非匀速时间点：使用贝塞尔缓动 + 随机扰动
function generateEasingKeyframes(duration: number): { time: number; value: number }[] {
  const frames: { time: number; value: number }[] = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // 先快后慢的缓动 + 随机抖动
    const eased = 1 - Math.pow(1 - t, 2.5);
    const jitter = i > 0 && i < steps ? (Math.random() - 0.5) * 0.03 : 0;
    const value = Math.min(99, Math.max(0, eased * 99 + jitter * 99));
    frames.push({ time: t * duration, value });
  }
  return frames;
}

function interpolateKeyframes(frames: { time: number; value: number }[], elapsed: number): number {
  if (elapsed <= 0) return 0;
  if (elapsed >= frames[frames.length - 1].time) return 99;
  for (let i = 1; i < frames.length; i++) {
    if (elapsed <= frames[i].time) {
      const prev = frames[i - 1];
      const curr = frames[i];
      const localT = (elapsed - prev.time) / (curr.time - prev.time);
      return prev.value + (curr.value - prev.value) * localT;
    }
  }
  return 99;
}

export const FakeProgressBar = forwardRef<FakeProgressBarHandle, FakeProgressBarProps>(({
  duration,
  direction = 'ltr',
  aspectRatio,
  gradientColors = ['#00ff88', '#00ccff'],
  animation = 'shimmer',
  attach = 'inborder',
  xPercent = 50,
  yPercent = 100,
  showPercent = false,
  thickness = 4,
}, ref) => {
  const [progress, setProgress] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [visible, setVisible] = useState(true);
  const startTimeRef = useRef(0);
  const keyframesRef = useRef(generateEasingKeyframes(duration));
  const rafRef = useRef<number>(0);

  const finish = useCallback(() => {
    setFinishing(true);
    setProgress(100);
    setTimeout(() => setVisible(false), 600);
  }, []);

  useImperativeHandle(ref, () => ({ finish }), [finish]);

  useEffect(() => {
    if (finishing) return;
    startTimeRef.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const val = interpolateKeyframes(keyframesRef.current, elapsed);
      setProgress(val);
      if (val < 99) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [finishing]);

  if (!visible) return null;

  const isHorizontal = direction === 'ltr' || direction === 'rtl';
  const gradientAngle = direction === 'ltr' ? '90deg' : direction === 'rtl' ? '270deg' : direction === 'ttb' ? '180deg' : '0deg';
  const gradientStr = `linear-gradient(${gradientAngle}, ${gradientColors.join(', ')})`;

  // 计算进度条尺寸
  let barWidth: string;
  let barHeight: string;
  if (aspectRatio) {
    const [w, h] = aspectRatio.split(':').map(Number);
    if (isHorizontal) {
      barHeight = `${thickness}px`;
      barWidth = `${thickness * (w / h)}px`;
    } else {
      barWidth = `${thickness}px`;
      barHeight = `${thickness * (w / h)}px`;
    }
  } else {
    if (isHorizontal) {
      barWidth = '100%';
      barHeight = `${thickness}px`;
    } else {
      barWidth = `${thickness}px`;
      barHeight = '100%';
    }
  }

  // 贴合位置计算
  const positionStyle: React.CSSProperties = {
    position: 'absolute',
  };

  if (attach === 'outborder') {
    // 外边界：进度条在 DOM 之外
    if (yPercent <= 25) {
      positionStyle.bottom = '100%';
    } else if (yPercent >= 75) {
      positionStyle.top = '100%';
    } else {
      positionStyle.top = '50%';
      positionStyle.transform = 'translateY(-50%)';
    }
    if (xPercent <= 25) {
      positionStyle.right = '100%';
    } else if (xPercent >= 75) {
      positionStyle.left = '100%';
    } else {
      positionStyle.left = '50%';
      if (positionStyle.transform) {
        positionStyle.transform = 'translate(-50%, -50%)';
      } else {
        positionStyle.transform = 'translateX(-50%)';
      }
    }
  } else {
    // 内边界：在 DOM 内部定位
    // xPercent: 0=左对左, 50=居中, 100=右对右
    if (isHorizontal) {
      positionStyle.left = `${xPercent}%`;
      positionStyle.transform = `translateX(-${xPercent}%)`;
    } else {
      positionStyle.left = `${xPercent}%`;
      positionStyle.transform = `translateX(-${xPercent}%)`;
    }

    if (isHorizontal) {
      positionStyle.top = `${yPercent}%`;
      if (positionStyle.transform) {
        positionStyle.transform += ` translateY(-${yPercent}%)`;
      } else {
        positionStyle.transform = `translateY(-${yPercent}%)`;
      }
    } else {
      positionStyle.top = `${yPercent}%`;
      if (positionStyle.transform) {
        positionStyle.transform += ` translateY(-${yPercent}%)`;
      } else {
        positionStyle.transform = `translateY(-${yPercent}%)`;
      }
    }
  }

  // 填充方向对应的 clip/size
  let fillStyle: React.CSSProperties = {};
  if (isHorizontal) {
    const fillPercent = progress;
    if (direction === 'ltr') {
      fillStyle = { width: `${fillPercent}%`, height: '100%' };
    } else {
      fillStyle = { width: `${fillPercent}%`, height: '100%', marginLeft: 'auto' };
    }
  } else {
    const fillPercent = progress;
    if (direction === 'ttb') {
      fillStyle = { height: `${fillPercent}%`, width: '100%' };
    } else {
      fillStyle = { height: `${fillPercent}%`, width: '100%', marginTop: 'auto' };
    }
  }

  const animationClass =
    animation === 'shimmer' ? 'fake-progress-shimmer' :
    animation === 'wave' ? 'fake-progress-wave' :
    animation === 'pulse' ? 'fake-progress-pulse' : '';

  return (
    <div
      style={{
        ...positionStyle,
        width: barWidth,
        height: barHeight,
        overflow: 'hidden',
        borderRadius: `${thickness / 2}px`,
        background: 'rgba(255,255,255,0.08)',
        opacity: finishing ? 0 : 1,
        transition: finishing ? 'opacity 0.5s ease-out' : undefined,
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <div
        className={animationClass}
        style={{
          ...fillStyle,
          background: gradientStr,
          borderRadius: `${thickness / 2}px`,
          transition: finishing ? 'width 0.5s ease-out, height 0.5s ease-out' : 'none',
          position: 'relative',
        }}
      >
        {/* 光泽扫过效果 */}
        {animation === 'shimmer' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
              animation: 'shimmerSlide 1.5s ease-in-out infinite',
            }}
          />
        )}
      </div>
      {showPercent && (
        <span
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '10px',
            fontWeight: 600,
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
          }}
        >
          {Math.round(progress)}%
        </span>
      )}
      <style>{`
        @keyframes shimmerSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .fake-progress-shimmer {}
        .fake-progress-wave {
          animation: waveEffect 2s ease-in-out infinite;
        }
        @keyframes waveEffect {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.3); }
        }
        .fake-progress-pulse {
          animation: pulseEffect 1.5s ease-in-out infinite;
        }
        @keyframes pulseEffect {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
});

FakeProgressBar.displayName = 'FakeProgressBar';
