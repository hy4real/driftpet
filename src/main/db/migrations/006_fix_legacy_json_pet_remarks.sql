UPDATE cards
SET pet_remark = 'You drifted. Pull one thread and keep it.'
WHERE pet_remark LIKE '{"title":"%'
   OR pet_remark LIKE '{%"petRemark"%';
