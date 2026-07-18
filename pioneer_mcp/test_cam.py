import cv2
import os
import requests
import base64
import numpy as np
from dotenv import load_dotenv

load_dotenv()

drone_ip = os.getenv("DRONE_IP")
if not drone_ip:
    print("IP дрона не задан в .env")
    exit()

print("Нажмите 'q' для выхода")
metadata_printed = False
while True:
    try:
        response = requests.get(f"http://{drone_ip}:6767/opt_camera", timeout=2)
        if response.status_code == 200:
            data = response.json()
            img_data = base64.b64decode(data['image'])
            np_arr = np.frombuffer(img_data, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            if not metadata_printed:
                print("Параметры изображения:")
                print(f"  Формат (Shape): {frame.shape}")
                print(f"  Тип данных (Dtype): {frame.dtype}")
                print(f"  Количество пикселей: {frame.size}")
                print(f"  Размер в байтах: {frame.nbytes}")
                if len(frame.shape) == 3:
                    h, w, c = frame.shape
                    print(f"  Ширина: {w} px, Высота: {h} px, Каналов: {c}")
                else:
                    h, w = frame.shape
                    print(f"  Ширина: {w} px, Высота: {h} px")
                print(f"  Мин. значение пикселя: {frame.min()}")
                print(f"  Макс. значение пикселя: {frame.max()}")
                print(f"  Среднее значение пикселя: {frame.mean():.2f}")
                print(f"  Поля JSON-ответа: {list(data.keys())}")
                metadata_printed = True
            
            cv2.imshow('Camera Feed', frame)
        else:
            print(f"Ошибка сервера: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Ошибка получения кадра: {e}")

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cv2.destroyAllWindows()