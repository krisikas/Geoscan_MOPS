import cv2

dev = 0
# Принудительно используем V4L2 API
cap = cv2.VideoCapture(dev, cv2.CAP_V4L2)

if not cap.isOpened():
    print("Ошибка: Невозможно открыть /dev/video51")
    exit()

# Жестко задаем формат YUYV
cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'YUYV'))
# Задаем разрешение из доступного списка v4l2-ctl
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
cap.set(cv2.CAP_PROP_FPS, 45)

ret, frame = cap.read()

if ret:
    cv2.imwrite("mopsframe.png", frame)
    print("Успех! Кадр сохранен как mopsframe.png")
else:
    print("Камера открылась, но кадр пустой. Скорее всего, отвал по питанию или ширине канала USB.")

cap.release()
