import os
import sys
import argparse
import cv2
import numpy as np
import torch
from importlib import import_module
from segment_anything import sam_model_registry

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image_path', type=str, required=True, help='Путь к исходному изображению')
    parser.add_argument('--output_path', type=str, default='./output_mask.png', help='Куда сохранить маску')
    parser.add_argument('--img_size', type=int, default=448, help='Размер картинки на входе в сеть')
    parser.add_argument('--ckpt', type=str, default='checkpoints/sam_vit_h_4b8939.pth')
    parser.add_argument('--delta_ckpt', type=str, required=True)
    parser.add_argument('--vit_name', type=str, default='vit_h')
    parser.add_argument('--delta_type', type=str, default='adapter', choices=['adapter', 'lora', 'both'])
    parser.add_argument('--middle_dim', type=int, default=32)
    parser.add_argument('--scaling_factor', type=float, default=0.2)
    parser.add_argument('--rank', type=int, default=4)
    args = parser.parse_args()

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

    # 1. Загрузка базового SAM
    sam, _ = sam_model_registry[args.vit_name](
        image_size=args.img_size,
        num_classes=1, 
        checkpoint=args.ckpt
    )

    # 2. Обертка в адаптер/LoRA
    if args.delta_type == 'adapter':
        pkg = import_module('delta.sam_adapter_image_encoder')
        net = pkg.Adapter_Sam(sam, args.middle_dim, args.scaling_factor).to(device)
    elif args.delta_type == 'lora':
        pkg = import_module('delta.sam_lora_image_encoder') 
        net = pkg.LoRA_Sam(sam, args.rank).to(device)
    else:
        pkg = import_module('delta.sam_adapter_lora_image_encoder') 
        net = pkg.LoRA_Adapter_Sam(sam, args.middle_dim, args.rank).to(device)    

    # 3. Загрузка весов
    net.load_delta_parameters(args.delta_ckpt)
    net.eval()

    # 4. Чтение и подготовка картинки
    img = cv2.imread(args.image_path)
    if img is None:
        print(f"Ошибка: Не удалось загрузить картинку по пути {args.image_path}")
        return
    
    h_orig, w_orig = img.shape[:2]
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_resized = cv2.resize(img_rgb, (args.img_size, args.img_size))
    
    # Внимание: здесь применяется базовая нормализация. 
    # Если в datasets/dataset_khanhha.py используется специфическая нормализация, 
    # её нужно будет продублировать сюда.
    img_tensor = torch.from_numpy(img_resized).float().permute(2, 0, 1).unsqueeze(0).to(device)
    # Оставляем в диапазоне [0, 255] для стандартной SAM нормализации

    # 5. Инференс
    with torch.no_grad():
        outputs = net(img_tensor, False, args.img_size)
        
        # --- УНИВЕРСАЛЬНАЯ РАСПАКОВКА ВЫВОДА ---
        # 1. Если модель вернула список (стандарт для SAM)
        if isinstance(outputs, list):
            outputs = outputs[0]
            
        # 2. Если это словарь, достаем тензор по ключу
        if isinstance(outputs, dict):
            if 'masks' in outputs:
                outputs = outputs['masks']
            elif 'pred_masks' in outputs:
                outputs = outputs['pred_masks']
            else:
                print(f"Внимание! Неизвестные ключи в ответе модели: {outputs.keys()}")
                # На крайний случай берем первое попавшееся значение
                outputs = list(outputs.values())[0] 
                
        # 3. Если это кортеж
        elif isinstance(outputs, tuple):
            outputs = outputs[0]
        # ---------------------------------------

        # Теперь, когда outputs — это точно тензор логитов, применяем сигмоиду
        probs = torch.sigmoid(outputs)
        
        # Бинаризация (инвертированная: трещины имеют низкую вероятность фона) и удаление лишних размерностей батча
        pred = (probs < 0.5).squeeze().cpu().numpy()
        
        # Если модель почему-то вернула несколько масок (мультимасковый выход), 
        # берем самую первую (основную)
        if pred.ndim > 2:
            pred = pred[0]

    # 6. Сохранение результата
    pred_resized = cv2.resize(pred.astype(np.uint8) * 255, (w_orig, h_orig), interpolation=cv2.INTER_NEAREST)
    cv2.imwrite(args.output_path, pred_resized)
    print(f"Готово! Маска сохранена в: {args.output_path}")

if __name__ == '__main__':
    main()